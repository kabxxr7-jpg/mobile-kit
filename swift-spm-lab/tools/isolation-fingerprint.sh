#!/bin/bash
# Read-only. Prints every file or folder in the real SwiftPM/Xcode locations that carries a name only this lab can have
# written (its work folder path, its package names). Empty output means the lab left no trace there.
# verify.sh uses it to tell the lab's own writes from other programs' (the Xcode app, for one, creates
# ~/Library/org.swift.swiftpm and touches DerivedData while it is open).
# With arguments it searches those folders instead of the real ones; verify.sh does that with two probe folders to
# prove this check can fail.
cd "$(dirname "$0")/.." || exit 2
. lib/env.sh

if [ $# -gt 0 ]; then
  LOCS=("$@")
else
  LOCS=("$REAL_HOME/Library/Caches/org.swift.swiftpm" "$REAL_HOME/Library/org.swift.swiftpm" "$REAL_HOME/.swiftpm" \
        "$REAL_HOME/Library/Developer/Xcode/DerivedData" "$REAL_HOME/Library/Caches/org.llvm.clang" "$REAL_HOME/.cache/clang")
fi
for p in "${LOCS[@]}"; do
  [ -e "$p" ] || continue
  grep -r -l -a -F -e "$WORK" -e "swift-spm-lab" -e "acmekit" -e "AcmeKit" -e "LabKit" -- "$p" 2>/dev/null
  find "$p" \( -iname '*acmekit*' -o -iname '*labkit*' \) -print 2>/dev/null
done
exit 0
