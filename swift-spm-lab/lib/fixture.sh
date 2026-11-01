# shellcheck shell=bash
# Sourced after lib/env.sh. Everything a scenario needs: a throwaway "world" per scenario,
# local git repositories as fixture dependencies, the consumer package, and sw(), the one
# way swift is ever called.

# Fixed identity and dates make every fixture commit hash identical on every run and every
# machine, so the revisions printed in docs/errors do not change between runs.
export GIT_AUTHOR_NAME="Lab Fixture" GIT_AUTHOR_EMAIL="fixture@example.invalid"
export GIT_COMMITTER_NAME="Lab Fixture" GIT_COMMITTER_EMAIL="fixture@example.invalid"

# ---- world ------------------------------------------------------------------------------
world_vars() {                       # $1 = scenario name
  NAME="$1"
  WORLD="$WORK/scenarios/$NAME"
  FX_DIR="$WORLD/fixtures"           # moved onto the case-sensitive volume by cs_up
  CONS="$WORLD/consumer"
  SCRATCH="$WORLD/scratch"           # what .build / DerivedData/<proj>/SourcePackages would be
  CACHE="$WORLD/cache"               # what ~/Library/Caches/org.swift.swiftpm would be
  CONFIG="$WORLD/config"
  SECURITY="$WORLD/security"
  OUT="$WORLD/out"
  DAEMON_PORT=""
  CS_MNT=""
}
fx_dir_set() { FX_DIR="$1"; FX="$FX_DIR/AcmeKit"; }

world_down() {                       # stop everything a world started; safe to call twice
  if [ -n "${WORLD:-}" ] && [ -f "$WORLD/daemon.pid" ]; then
    kill "$(cat "$WORLD/daemon.pid")" 2>/dev/null
    rm -f "$WORLD/daemon.pid"
  fi
  if [ -n "${CS_MNT:-}" ] && mount | grep -q " on $CS_MNT "; then
    hdiutil detach "$CS_MNT" -quiet >/dev/null 2>&1 || hdiutil detach "$CS_MNT" -force -quiet >/dev/null 2>&1
  fi
}
world_reset() {
  world_down
  safe_rm "$WORLD"
  mkdir -p "$WORLD" "$OUT"
  OBS_N=0
  fx_dir_set "$WORLD/fixtures"
  mkdir -p "$FX_DIR"
}

# ---- the only way swift is called ---------------------------------------------------------
# All four location flags point into the world; HOME and TMPDIR are already inside .work.
sw() {                               # sw <build|test|package> [args...]
  local sub="$1"; shift
  ( cd "$CONS" && swift "$sub" \
      --scratch-path "$SCRATCH" --cache-path "$CACHE" \
      --config-path "$CONFIG" --security-path "$SECURITY" "$@" )
}

# ---- git fixture helpers (the dependency, "AcmeKit") ------------------------------------------
fx_new() { mkdir -p "$FX"; git -C "$FX" init -q -b main; }
fx_commit() {                        # fx_commit <message> [day-of-january-2026]
  local d; d="$(printf '2026-01-%02dT00:00:00Z' "${2:-1}")"
  git -C "$FX" add -A
  GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" git -C "$FX" commit -q --allow-empty -m "$1"
}
fx_tag() { git -C "$FX" tag "$@"; }
fx_rev() { git -C "$FX" rev-parse "${1:-HEAD}"; }
fx_rewrite_history() {               # fx_rewrite_history <day> [tag...]: amend the tip, move the given tags onto it,
                                     # then really delete the old commit (like a force-push plus a server-side gc)
  local d t; d="$(printf '2026-01-%02dT00:00:00Z' "${1:-5}")"; shift
  GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" git -C "$FX" commit -q --amend -m "history rewritten"
  for t in "$@"; do git -C "$FX" tag -f "$t" >/dev/null; done
  git -C "$FX" reflog expire --expire=now --all
  git -C "$FX" gc -q --prune=now
}

write_src() {                        # write_src [subdir]  -> <subdir>/Sources/AcmeKit/AcmeKit.swift
  local base="${1:-.}"
  mkdir -p "$FX/$base/Sources/AcmeKit"
  printf 'public func acmeGreeting() -> String { "hello from AcmeKit" }\n' > "$FX/$base/Sources/AcmeKit/AcmeKit.swift"
}
write_manifest() {                   # write_manifest [tools-version] [file] [target-path]
  local tools="${1:-5.9}" file="${2:-Package.swift}" tpath="${3:-}" extra=""
  [ -n "$tpath" ] && extra=", path: \"$tpath\""
  mkdir -p "$(dirname "$FX/$file")"
  cat > "$FX/$file" <<EOF
// swift-tools-version: $tools
import PackageDescription

let package = Package(
    name: "AcmeKit",
    products: [.library(name: "AcmeKit", targets: ["AcmeKit"])],
    targets: [.target(name: "AcmeKit"$extra)]
)
EOF
}

# ---- consumer package ---------------------------------------------------------------------
dep()     { printf '.package(url: "file://%s", %s)' "${2:-$FX}" "$1"; }           # dep '<requirement>' [path]
dep_git() { printf '.package(url: "git://127.0.0.1:%s/AcmeKit", %s)' "$DAEMON_PORT" "$1"; }

consumer_manifest() {                # rewrite Package.swift only: consumer_manifest '<dependency clause>' [package identity]
  DEPS="$1" PKGID="${2:-AcmeKit}" perl -pe 's/\@DEPENDENCIES\@/$ENV{DEPS}/; s/\@PKGID\@/$ENV{PKGID}/' \
    "$LAB_ROOT/consumer-template/Package.swift.in" > "$CONS/Package.swift"
}
consumer_init() {                    # copy the template, write its manifest
  safe_rm "$CONS"
  mkdir -p "$CONS"
  cp -R "$LAB_ROOT/consumer-template/Sources" "$LAB_ROOT/consumer-template/Tests" "$CONS/"
  consumer_manifest "$@"
}
pin_of() {                           # pin_of <identity> -> revision recorded in the consumer's Package.resolved
  perl -0ne 'print $1 if /"identity"\s*:\s*"'"$1"'".*?"revision"\s*:\s*"([0-9a-f]+)"/s' "$CONS/Package.resolved"
}

# ---- local git daemon (only for the shared-cache scenarios) ---------------------------------------
# SwiftPM does not use the shared cache for file:// repositories (checked on this toolchain: the
# cache directory then only holds manifests/). A repository served over git:// on 127.0.0.1 is
# treated as remote, so its bare clone lands in --cache-path/repositories like a GitHub one.
# The daemon listens on loopback only, is started and stopped by the scenario, and its pid file
# lives in the world.
daemon_up() {
  DAEMON_PORT=41873
  while nc -z 127.0.0.1 "$DAEMON_PORT" 2>/dev/null; do
    DAEMON_PORT=$((DAEMON_PORT + 1))
    [ "$DAEMON_PORT" -gt 41990 ] && die "no free loopback port between 41873 and 41990"
  done
  git daemon --listen=127.0.0.1 --port="$DAEMON_PORT" --base-path="$FX_DIR" --export-all \
      --reuseaddr --pid-file="$WORLD/daemon.pid" --detach >/dev/null 2>&1
  local i=0
  while ! nc -z 127.0.0.1 "$DAEMON_PORT" 2>/dev/null; do
    i=$((i + 1)); [ "$i" -gt 50 ] && die "git daemon did not start on port $DAEMON_PORT"
    sleep 0.1
  done
}

# ---- case-sensitive volume (stand-in for a Linux CI runner) ------------------------------------
# A 40 MB sparse disk image formatted as case-sensitive APFS, mounted inside the world.
# No sudo needed; detached by world_down.
cs_up() {
  hdiutil create -quiet -size 40m -fs "Case-sensitive APFS" -volname SPMLabCS -type SPARSE "$WORLD/cs" >/dev/null 2>&1 \
    || return 1
  CS_MNT="$WORLD/csvol"
  mkdir -p "$CS_MNT"
  hdiutil attach "$WORLD/cs.sparseimage" -mountpoint "$CS_MNT" -nobrowse -noverify -noautoopen -quiet >/dev/null 2>&1 \
    || return 1
  fx_dir_set "$CS_MNT/fixtures"
  mkdir -p "$FX_DIR"
}

# ---- observations: extra things worth recording next to the error text -------------------------
OBS_N=0
observe() {                          # observe "<label>" <command...>   (output is kept in the scenario's error file)
  OBS_N=$((OBS_N + 1))
  local label="$1"; shift
  printf '%s\n' "$label" > "$OUT/obs-$OBS_N.label"
  "$@" > "$OUT/obs-$OBS_N.txt" 2>&1
  echo "$?" > "$OUT/obs-$OBS_N.rc"
  printf '%s\n' "$*" | sed -E 's/^sw /swift /' > "$OUT/obs-$OBS_N.cmd"
}

# ---- shared-cache clone helpers (used with daemon_up) ------------------------------------------
cache_clone() { ls -d "$CACHE"/repositories/AcmeKit-* 2>/dev/null | head -1; }
cache_unpack() {                     # turn the cached clone's pack into loose objects so single objects can be removed
  local cl p; cl="$(cache_clone)"
  [ -n "$cl" ] || die "cache_unpack: no cached clone under $CACHE/repositories"
  chmod -R u+w "$cl"
  mkdir -p "$WORLD/cache-packs"
  mv "$cl"/objects/pack/*.pack "$WORLD/cache-packs/"
  rm -f "$cl"/objects/pack/*
  for p in "$WORLD"/cache-packs/*.pack; do git -C "$cl" unpack-objects -q < "$p"; done
  safe_rm "$WORLD/cache-packs"
}
cache_remove_object() {              # cache_remove_object <rev[:path]>   e.g. 1.1.0:Package.swift
  local cl sha; cl="$(cache_clone)"
  sha="$(git -C "$cl" rev-parse "$1")" || die "cache_remove_object: cannot resolve $1"
  rm -f "$cl/objects/${sha:0:2}/${sha:2}"
}
