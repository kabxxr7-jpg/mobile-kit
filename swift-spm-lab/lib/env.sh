# shellcheck shell=bash
# Sourced by every lab script, never executed. Builds the isolated environment.
#
# Why HOME is overridden and not only the four --*-path flags: on the toolchain this lab was
# written on (Swift 6.4.2), `swift package` creates ~/.swiftpm and ~/Library/org.swift.swiftpm
# at start-up even when --scratch-path, --cache-path, --config-path and --security-path are
# all given, and `swift package <subcommand> --help` loads the manifest into the real
# ~/Library/Caches/org.swift.swiftpm. Only a different HOME keeps the real directories
# untouched. The flags are still passed on every command (see sw() in lib/fixture.sh).
#
# Bash 3.2 compatible (the macOS system bash): no associative arrays, no mapfile, no set -u
# (empty arrays trip it).

LAB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
export LAB_ROOT
WORK="$LAB_ROOT/.work"
export WORK

# The real home is needed only by the isolation check, which reads it and never writes to it.
# getpwnam, so it does not depend on $HOME.
REAL_HOME="$(eval echo "~$(id -un)")"
export REAL_HOME

# xcode-select may still point at the Command Line Tools and changing it needs sudo,
# so the Xcode toolchain is selected per process.
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

mkdir -p "$WORK/home" "$WORK/tmp" "$WORK/clang-module-cache" "$WORK/raw" "$WORK/results"
export HOME="$WORK/home"
export TMPDIR="$WORK/tmp/"
export CLANG_MODULE_CACHE_PATH="$WORK/clang-module-cache"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_CONFIG_HOME="$HOME/.config"
# Deterministic git: no user or system config (url rewrites, hooks, templates), no prompts.
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_NOSYSTEM=1
export GIT_TERMINAL_PROMPT=0
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR

die() { echo "lab: $*" >&2; exit 2; }

case "$HOME" in
  "$WORK"/*) ;;
  *) die "refusing to run: HOME is not inside $WORK" ;;
esac
[ -d "$DEVELOPER_DIR" ] || die "DEVELOPER_DIR does not exist: $DEVELOPER_DIR (set it to your Xcode's Contents/Developer)"

# Only ever delete inside .work. Every removal in the lab goes through here.
safe_rm() {
  local p
  for p in "$@"; do
    case "$p" in
      "$WORK"/?*) ;;
      *) die "safe_rm refuses to delete outside $WORK: $p" ;;
    esac
    [ -e "$p" ] || [ -L "$p" ] || continue
    chmod -R u+w "$p" 2>/dev/null
    rm -rf "$p"
  done
}
