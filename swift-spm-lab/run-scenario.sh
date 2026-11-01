#!/bin/bash
# Run one scenario: break it, capture the real tool output, apply each fix and each wrong fix.
#
#   ./run-scenario.sh <name> [--record] [--phase break|fix|wrong]
#
# --record  write the captured text to docs/errors/<name>.txt (default: only compare with it)
# Results go to .work/results/<name>.tsv (read by verify.sh). Exit status 1 if anything FAILED.
cd "$(dirname "$0")" || exit 2
# shellcheck source=lib/env.sh
. lib/env.sh
. lib/fixture.sh
. lib/capture.sh
. lib/wrong.sh

NAME_ARG=""; RECORD=0; PHASE="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --record) RECORD=1 ;;
    --phase) shift; PHASE="$1" ;;
    -*) die "unknown option $1" ;;
    *) NAME_ARG="$1" ;;
  esac
  shift
done
[ -n "$NAME_ARG" ] || die "usage: run-scenario.sh <name> [--record] [--phase break|fix|wrong]"
SCEN_FILE="$(ls scenarios/*-"$NAME_ARG".sh 2>/dev/null | head -1)"
[ -n "$SCEN_FILE" ] || die "no scenario named $NAME_ARG (see ./verify.sh --list)"

# ---- defaults a scenario file may override ----------------------------------------------------
TITLE=""; EXPECT=""; KIND="error"; NEEDS_DAEMON=0; NEEDS_CS=0
RESOLVE_ARGS=(); FIXES=(); WRONGS=()
scenario_setup() { die "scenario $NAME_ARG defines no scenario_setup"; }
scenario_observe() { :; }                      # optional: observe "<label>" <cmd>... after the break run
# shellcheck source=/dev/null
. "$SCEN_FILE"

world_vars "$NAME_ARG"
trap 'world_down' EXIT
trap 'world_down; exit 130' INT TERM
RESULTS="$WORK/results/$NAME.tsv"; : > "$RESULTS"
FAILED=0
row() { printf '%s\n' "$(IFS=$'\t'; echo "$*")" >> "$RESULTS"; }      # tab separated

prepare() {                                    # fresh world, then the scenario's broken state
  world_reset
  if [ "$NEEDS_CS" = 1 ]; then cs_up || return 3; fi
  if [ "$NEEDS_DAEMON" = 1 ]; then daemon_up; fi
  scenario_setup || return 1
}
replay() { run_step replay package resolve "${RESOLVE_ARGS[@]}"; }        # same first attempt as in the break phase

verify_ok() {                                  # after a fix: resolve and build must both succeed
  run_step fixed-resolve package resolve "${RESOLVE_ARGS[@]}"
  [ "$(rc_of fixed-resolve)" = 0 ] || return 1
  run_step fixed-build build "${RESOLVE_ARGS[@]}"
  [ "$(rc_of fixed-build)" = 0 ]
}

# ---- phase: break -----------------------------------------------------------------------------
phase_break() {
  prepare; local p=$?
  if [ $p = 3 ]; then row break "$NAME" SKIP "-" "-" "-" "-" "case-sensitive volume could not be created (hdiutil)"; return 0; fi
  if [ $p != 0 ]; then row break "$NAME" FAIL "-" "-" "-" "-" "scenario setup failed"; FAILED=1; return 0; fi

  run_step resolve package resolve "${RESOLVE_ARGS[@]}"
  run_step build build "${RESOLVE_ARGS[@]}"
  [ "$KIND" = control ] && run_step test test
  scenario_observe

  local rrc brc status="PASS" pkg="no" msg
  rrc="$(rc_of resolve)"; brc="$(rc_of build)"
  if [ "$KIND" = control ]; then
    { [ "$rrc" = 0 ] && [ "$brc" = 0 ] && [ "$(rc_of test)" = 0 ]; } || status="FAIL"
    msg="control: resolve, build and swift test all succeed"
  else
    [ "$rrc" != 0 ] || status="FAIL"
    normalize < "$OUT/resolve.txt" | grep -Eq "$EXPECT" || status="FAIL"
    msg="$(first_error resolve)"
  fi
  normalize < "$OUT/resolve.txt" | grep -q 'Package\.swift' && pkg="yes"

  {
    echo "# scenario: $NAME"
    echo "# title: $TITLE"
    echo "# toolchain: $(swift_version_line)"
    echo "# every command ran with --scratch-path, --cache-path, --config-path and --security-path inside swift-spm-lab/.work (flags not shown)"
    echo "# text is the tool's own, with only these changes: lab path -> <LAB>, loopback port -> <PORT>, clone hash -> <hash>,"
    echo "# durations -> <t>, and progress-counter lines like [3 / 42] removed"
    section "swift package resolve ${RESOLVE_ARGS[*]}" "$rrc" "$OUT/resolve.txt"
    section "swift build ${RESOLVE_ARGS[*]}" "$brc" "$OUT/build.txt"
    [ "$KIND" = control ] && section "swift test" "$(rc_of test)" "$OUT/test.txt"
    local i=1
    while [ -f "$OUT/obs-$i.txt" ]; do
      section "observation: $(cat "$OUT/obs-$i.label") | \$ $(cat "$OUT/obs-$i.cmd")" "$(cat "$OUT/obs-$i.rc")" "$OUT/obs-$i.txt"
      i=$((i + 1))
    done
  } > "$OUT/doc.txt"

  local docstate="new"
  if [ -f "docs/errors/$NAME.txt" ]; then
    if cmp -s "$OUT/doc.txt" "docs/errors/$NAME.txt"; then docstate="same"; else docstate="differs"; fi
  fi
  if [ "$RECORD" = 1 ]; then cp "$OUT/doc.txt" "docs/errors/$NAME.txt"; [ "$docstate" = same ] || docstate="$docstate(recorded)"; fi
  safe_rm "$WORK/raw/$NAME"; cp -R "$OUT" "$WORK/raw/$NAME"
  [ "$status" = PASS ] || FAILED=1
  row break "$NAME" "$status" "resolve=$rrc" "build=$brc" "pkgswift=$pkg" "doc=$docstate" "$msg"
}

# ---- phase: fix ---------------------------------------------------------------------------------
phase_fix() {
  local f
  for f in "${FIXES[@]}"; do
    prepare || { row fix "$f" FAIL "setup failed"; FAILED=1; continue; }
    replay
    "fix_$f" > "$OUT/fix-$f.log" 2>&1
    if verify_ok; then
      row fix "$f" PASS "resolve and build succeed after the fix"
    else
      FAILED=1
      row fix "$f" FAIL "after the fix: $(first_error fixed-resolve)"
    fi
  done
}

# ---- phase: wrong fixes ---------------------------------------------------------------------------
phase_wrong() {
  local w
  for w in "${WRONGS[@]}"; do
    prepare || { row wrong "$w" FAIL "setup failed"; FAILED=1; continue; }
    replay
    "wrong_$w" > "$OUT/wrong-$w.log" 2>&1
    run_step wrong-resolve package resolve "${RESOLVE_ARGS[@]}"
    if [ "$(rc_of wrong-resolve)" = 0 ]; then
      FAILED=1
      row wrong "$w" ACCEPTED "the wrong fix made resolve succeed"
    elif normalize < "$OUT/wrong-resolve.txt" | grep -Eq "$EXPECT"; then
      row wrong "$w" REFUSED "same error: $(first_error wrong-resolve)"
    else
      row wrong "$w" REFUSED "different error: $(first_error wrong-resolve)"
    fi
  done
}

case "$PHASE" in
  break) phase_break ;;
  fix)   phase_fix ;;
  wrong) phase_wrong ;;
  all)   phase_break; phase_fix; phase_wrong ;;
  *) die "unknown phase $PHASE" ;;
esac

world_down
[ "${LAB_KEEP:-0}" = 1 ] || safe_rm "$WORLD"
exit "$FAILED"
