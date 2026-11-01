#!/bin/bash
# Prints a listing (type, size, mtime) of every real-home location SwiftPM or Xcode would write
# to if the lab were not isolated. Read-only. verify.sh runs it before and after and diffs.
#
# Deliberately NOT watched: ~/Library/Developer/CoreSimulator and the rest of ~/Library/Developer/Xcode
# (other tools, such as a runtime download, change those, and the lab never touches them).
cd "$(dirname "$0")/.." || exit 2
. lib/env.sh

for p in \
  "$REAL_HOME/Library/Caches/org.swift.swiftpm" \
  "$REAL_HOME/Library/org.swift.swiftpm" \
  "$REAL_HOME/.swiftpm" \
  "$REAL_HOME/Library/Developer/Xcode/DerivedData" \
  "$REAL_HOME/Library/Caches/org.llvm.clang" \
  "$REAL_HOME/.cache/clang"; do
  if [ -e "$p" ] || [ -L "$p" ]; then
    echo "PRESENT $p"
    find "$p" -print0 | xargs -0 stat -f '  %N|%HT|%z|%m' | sort
  else
    echo "ABSENT  $p"
  fi
done
