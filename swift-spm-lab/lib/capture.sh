# shellcheck shell=bash
# Sourced after lib/fixture.sh. Runs one step, keeps its raw output, and turns raw output into
# the text stored in docs/errors/<name>.txt.

# run_step <label> <swift-subcommand> [args...]
# Output (stdout and stderr, merged in order) goes to $OUT/<label>.txt, the exit code to $OUT/<label>.rc.
run_step() {
  local label="$1"; shift
  sw "$@" > "$OUT/$label.txt" 2>&1
  echo "$?" > "$OUT/$label.rc"
  return 0
}
rc_of() { cat "$OUT/$1.rc"; }

# The only changes between raw tool output and docs/errors text. Nothing else is edited:
#   * ANSI escapes removed (none appear when not on a TTY, kept for safety)
#   * progress-counter lines such as "[12 / 50]" removed (timing dependent); test timestamps
#     and "seconds" figures replaced by <time> / <t>
#   * the lab's absolute path -> <LAB>      (so the files do not contain a username)
#   * loopback port -> <PORT>, clone directory hash -> <hash>, durations -> <t>
normalize() {
  perl -e '
    my $lab = $ENV{LAB_ROOT};
    while (<STDIN>) {
      s/\e\[[0-9;]*[A-Za-z]//g;
      # progress counters: "[3 / 42] Name", "[1/11] Fetching ..." (the slash is padded with
      # U+2009 thin spaces, which perl sees as bytes) and "[Planning deferred tasks]"
      next if /^\[[^\]]*\d[^\]]*\/[^\]]*\d\]/;
      next if /^\[Planning deferred tasks\]/;
      s/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+/<time>/g;
      s/\d+\.\d+/<t>/g if /seconds/;
      s/\Q$lab\E/<LAB>/g;
      s/127\.0\.0\.1:\d+/127.0.0.1:<PORT>/g;
      s/\(port \d+\)/(port <PORT>)/g;
      s/AcmeKit-[0-9a-f]{8}/AcmeKit-<hash>/g;
      s/\((\d+\.\d+)s\)/(<t>s)/g;
      s/\((\d+\.\d+) secs\)/(<t> secs)/g;
      print;
    }'
}

swift_version_line() { swift --version 2>&1 | grep -m1 'Swift version' | sed 's/^.*Apple Swift/Apple Swift/'; }

# first_error <label>: the first "error:" line of a step (normalised), or the last line if none
first_error() {
  local f="$OUT/$1.txt" line
  line="$(normalize < "$f" | grep -m1 -E '^error:')"
  [ -z "$line" ] && line="$(normalize < "$f" | grep -v '^$' | tail -1)"
  printf '%s' "$line"
}

# section <title> <rc> <file>: one block of the docs file
section() {
  printf '\n# ===== %s (exit %s) =====\n' "$1" "$2" | normalize
  normalize < "$3"
}
