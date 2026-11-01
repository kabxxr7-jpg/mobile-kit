#!/bin/bash
# Runs every scenario: break it, capture the real error, apply the matching fix(es), apply the
# wrong fixes, and print one table. Exit status 0 only if everything behaved as documented.
#
#   ./verify.sh                 all scenarios; rewrites docs/errors/*.txt and docs/RESULTS.md
#   ./verify.sh --no-record     same, but leaves docs/ alone (still compares with docs/errors)
#   ./verify.sh --only a,b      only those scenarios (never rewrites docs/RESULTS.md)
#   ./verify.sh --list          scenario names and titles
#
# macOS only. Needs Xcode at $DEVELOPER_DIR (default /Applications/Xcode.app/Contents/Developer).
# Nothing here uses a simulator, the network, sudo or the real SwiftPM/Xcode caches.
cd "$(dirname "$0")" || exit 2
. lib/env.sh
. lib/capture.sh

RECORD=1; ONLY=""; LIST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-record) RECORD=0 ;;
    --only) shift; ONLY="$1" ;;
    --list) LIST=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "unknown option $1" ;;
  esac
  shift
done

ALL=""
for f in scenarios/*.sh; do b="${f#scenarios/}"; b="${b%.sh}"; ALL="$ALL ${b#*-}"; done
if [ "$LIST" = 1 ]; then
  for n in $ALL; do printf '%-34s %s\n' "$n" "$(sed -n 's/^TITLE="\(.*\)"$/\1/p' scenarios/*-"$n".sh)"; done
  exit 0
fi
if [ -n "$ONLY" ]; then NAMES="$(echo "$ONLY" | tr ',' ' ')"; else NAMES="$ALL"; fi

[ "$(uname)" = Darwin ] || die "this lab runs on macOS only"
git --version >/dev/null 2>&1 || die "git not found"
SWIFT_LINE="$(swift_version_line)"
[ -n "$SWIFT_LINE" ] || die "swift --version printed nothing; is DEVELOPER_DIR=$DEVELOPER_DIR a real Xcode?"
MACOS="$(sw_vers -productVersion) ($(uname -m))"
DISK_BEFORE="$(df -g "$LAB_ROOT" | awk 'NR==2{print $4}')"

echo "toolchain : $SWIFT_LINE"
echo "macOS     : $MACOS"
echo "git       : $(git --version)"
echo "DEVELOPER_DIR=$DEVELOPER_DIR   free disk: ${DISK_BEFORE} GiB"
echo "isolation : HOME=$HOME (not the real home); TMPDIR, caches and config inside .work"
echo

tools/isolation-snapshot.sh > "$WORK/isolation-before.txt"
rm -f "$WORK"/results/*.tsv

START=$(date +%s); RUNFAIL=0
for n in $NAMES; do
  s=$(date +%s)
  if [ "$RECORD" = 1 ]; then ./run-scenario.sh "$n" --record; else ./run-scenario.sh "$n"; fi
  rc=$?
  [ "$rc" = 0 ] || RUNFAIL=1
  printf '  ran %-34s %s (%ss)\n' "$n" "$([ $rc = 0 ] && echo ok || echo FAILED)" "$(( $(date +%s) - s ))"
done
echo

# ---- isolation and strays ------------------------------------------------------------------------------
tools/isolation-snapshot.sh > "$WORK/isolation-after.txt"
if diff -u "$WORK/isolation-before.txt" "$WORK/isolation-after.txt" > "$WORK/isolation.diff"; then
  ISO="unchanged"; ISO_OK=1
else
  ISO="CHANGED (see .work/isolation.diff)"; ISO_OK=0
fi
STRAY_MOUNTS="$(mount | grep -c " on $WORK/" )"
STRAY_DAEMONS="$(pgrep -f "base-path=$WORK/" | wc -l | tr -d ' ')"
STRAY_OK=1; { [ "$STRAY_MOUNTS" = 0 ] && [ "$STRAY_DAEMONS" = 0 ]; } || STRAY_OK=0

# ---- tables --------------------------------------------------------------------------------------------
trunc() { perl -CSA -e 'my ($s,$n)=@ARGV; $s =~ s/\|/\\|/g; $s = substr($s,0,$n-1)."..." if length($s)>$n; print $s' -- "$1" "$2"; }
cnt()   { echo $(( $(awk -F'\t' -v p="$1" -v s="$2" '$1==p && ($3==s || s=="*")' "$3" | wc -l) )); }

TABLE1="| # | scenario | resolve | Package.swift in message | first line of the real error (trimmed) | fixes verified | wrong fixes refused | docs/errors |
|---|---|---|---|---|---|---|---|"
TABLE2="| scenario | wrong fix | result |
|---|---|---|"
T_FIX=0; P_FIX=0; T_WR=0; R_WR=0; BAD=0; i=0
for n in $NAMES; do
  f="$WORK/results/$n.tsv"; i=$((i + 1))
  if [ ! -s "$f" ]; then TABLE1="$TABLE1
| $i | $n | NO RESULT | | | | | |"; BAD=1; continue; fi
  b="$(awk -F'\t' '$1=="break"' "$f")"
  bs="$(echo "$b" | cut -f3)"; rr="$(echo "$b" | cut -f4)"; pk="$(echo "$b" | cut -f6)"; ds="$(echo "$b" | cut -f7)"; msg="$(echo "$b" | cut -f8)"
  rr="${rr#resolve=}"; pk="${pk#pkgswift=}"; ds="${ds#doc=}"
  nf=$(cnt fix '*' "$f"); pf=$(cnt fix PASS "$f"); nw=$(cnt wrong '*' "$f"); rw=$(cnt wrong REFUSED "$f")
  T_FIX=$((T_FIX + nf)); P_FIX=$((P_FIX + pf)); T_WR=$((T_WR + nw)); R_WR=$((R_WR + rw))
  [ "$bs" = PASS ] || [ "$bs" = SKIP ] || BAD=1
  [ "$pf" = "$nf" ] || BAD=1
  [ "$rw" = "$nw" ] || BAD=1
  label="$n"; [ "$bs" = PASS ] || label="$n ($bs)"
  TABLE1="$TABLE1
| $i | $label | exit $rr | $pk | $(trunc "$msg" 100) | $pf/$nf | $rw/$nw | $ds |"
  while IFS=$'\t' read -r ph lb st dt; do
    [ "$ph" = wrong ] || continue
    TABLE2="$TABLE2
| $n | $lb | $st: $(trunc "$dt" 90) |"
  done < "$f"
done

echo "$TABLE1"; echo; echo "$TABLE2"; echo

TOTALS="scenarios: $i | fixes verified (resolve + build): $P_FIX/$T_FIX | wrong fixes refused: $R_WR/$T_WR"
echo "$TOTALS"
echo "real SwiftPM/Xcode locations before vs after the whole run: $ISO"
echo "stray mounts: $STRAY_MOUNTS, stray git daemons: $STRAY_DAEMONS"
echo "free disk: ${DISK_BEFORE} GiB before, $(df -g "$LAB_ROOT" | awk 'NR==2{print $4}') GiB after; total time $(( $(date +%s) - START ))s"

if [ "$RECORD" = 1 ] && [ -z "$ONLY" ]; then
  {
    echo "# Results of the last full verify run"
    echo
    echo "Written by \`./verify.sh\` (see the README for what it does and does not prove)."
    echo
    echo "* Date: $(date +%Y-%m-%d)"
    echo "* Toolchain: $SWIFT_LINE"
    echo "* macOS: $MACOS"
    echo "* $TOTALS"
    echo "* Real SwiftPM/Xcode locations before vs after the run: $ISO"
    echo "* Stray mounts: $STRAY_MOUNTS, stray git daemons: $STRAY_DAEMONS"
    echo
    echo "$TABLE1"
    echo
    echo "A wrong fix is **refused** when \`swift package resolve\` still fails after it. \"same error\" means the original message is still there; \"different error\" means resolve fails for another reason (for example the lock-file mode refuses a missing Package.resolved)."
    echo
    echo "$TABLE2"
  } > docs/RESULTS.md
fi

[ "$BAD" = 0 ] && [ "$RUNFAIL" = 0 ] && [ "$ISO_OK" = 1 ] && [ "$STRAY_OK" = 1 ] && { echo "RESULT: PASS"; exit 0; }
echo "RESULT: FAIL"; exit 1
