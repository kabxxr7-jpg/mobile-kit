#!/bin/bash
# OPTIONAL real-world check. Resolves (does not build) the real firebase-ios-sdk and
# facebook-ios-sdk at pinned tags with `swift package resolve`, in the same isolated paths as the
# lab, records the exact tool output, wall time and disk use, then deletes everything it created.
#
#   tools/real-sdk-resolve.sh [firebase-tag] [facebook-tag]
#
# Needs network access to github.com (public, read-only clones) and more than 14 GiB free disk.
# Refuses to start below that. Nothing is signed up to or logged in to. Not part of verify.sh.
cd "$(dirname "$0")/.." || exit 2
. lib/env.sh
. lib/fixture.sh
. lib/capture.sh

MIN_GIB=14
FIREBASE_TAG="${1:-}"; FACEBOOK_TAG="${2:-}"
FREE_BEFORE="$(df -g "$LAB_ROOT" | awk 'NR==2{print $4}')"
[ "$FREE_BEFORE" -gt "$MIN_GIB" ] || die "only $FREE_BEFORE GiB free, need more than $MIN_GIB; skipping the real-SDK resolve"

latest_tag() {                       # highest x.y.z tag of a repository, read from the remote (a leading v is dropped)
  git ls-remote --tags --refs "$1" 2>/dev/null | awk '{print $2}' | sed 's|refs/tags/||' \
    | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' | sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1
}
[ -n "$FIREBASE_TAG" ] || FIREBASE_TAG="$(latest_tag https://github.com/firebase/firebase-ios-sdk.git)"
[ -n "$FACEBOOK_TAG" ] || FACEBOOK_TAG="$(latest_tag https://github.com/facebook/facebook-ios-sdk.git)"
[ -n "$FIREBASE_TAG" ] && [ -n "$FACEBOOK_TAG" ] || die "could not read tags from github.com (no network?)"

R="$WORK/real"; safe_rm "$R"; mkdir -p "$R/consumer/Sources/RealSDKResolve"
CONS="$R/consumer"; SCRATCH="$R/scratch"; CACHE="$R/cache"; CONFIG="$R/config"; SECURITY="$R/security"
cat > "$CONS/Package.swift" <<EOF
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RealSDKResolve",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "RealSDKResolve", targets: ["RealSDKResolve"])],
    dependencies: [
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", exact: "$FIREBASE_TAG"),
        .package(url: "https://github.com/facebook/facebook-ios-sdk.git", exact: "$FACEBOOK_TAG"),
    ],
    targets: [
        .target(name: "RealSDKResolve", dependencies: [
            .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
            .product(name: "FacebookLogin", package: "facebook-ios-sdk"),
        ]),
    ]
)
EOF
echo "// resolve-only check; nothing here is ever compiled" > "$CONS/Sources/RealSDKResolve/Empty.swift"

echo "firebase-ios-sdk $FIREBASE_TAG, facebook-ios-sdk $FACEBOOK_TAG; free disk before: ${FREE_BEFORE} GiB"
START=$(date +%s)
sw package resolve > "$R/resolve.txt" 2>&1
RC=$?
SECS=$(( $(date +%s) - START ))
FREE_AFTER="$(df -g "$LAB_ROOT" | awk 'NR==2{print $4}')"
SCRATCH_MB=$(( $(du -sk "$SCRATCH" 2>/dev/null | cut -f1) / 1024 ))
CACHE_MB=$(( $(du -sk "$CACHE" 2>/dev/null | cut -f1) / 1024 ))
PINS=$(grep -c '"identity"' "$CONS/Package.resolved" 2>/dev/null)
PKGMSG="no"; grep -q 'Package\.swift' "$R/resolve.txt" && PKGMSG="yes"
ERRS="$(grep -c -E '^(error|warning):' "$R/resolve.txt")"

OUTFILE="$R/report.txt"
{
  echo "firebase-ios-sdk: $FIREBASE_TAG"
  echo "facebook-ios-sdk: $FACEBOOK_TAG"
  echo "toolchain: $(swift_version_line)"
  echo "command: swift package resolve   (isolated paths inside .work, HOME overridden)"
  echo "exit code: $RC"
  echo "wall time: ${SECS}s"
  echo "packages pinned in Package.resolved: $PINS"
  echo "disk: scratch ${SCRATCH_MB} MiB + cache ${CACHE_MB} MiB; free ${FREE_BEFORE} GiB before, ${FREE_AFTER} GiB after"
  echo "'Package.swift' appears in the output: $PKGMSG; error or warning lines: $ERRS"
  echo
  echo "---- output (lab path replaced by <LAB>; progress counters removed) ----"
  normalize < "$R/resolve.txt"
} > "$OUTFILE"
cat "$OUTFILE"
cp "$OUTFILE" "$WORK/raw/real-sdk-resolve.txt"

safe_rm "$R"
echo "scratch, cache and consumer deleted; free disk now: $(df -g "$LAB_ROOT" | awk 'NR==2{print $4}') GiB"
exit "$RC"
