# shellcheck shell=bash
TITLE="The manifest is committed as package.swift (lower case); SwiftPM reads it from the git tree, which is case-sensitive"
EXPECT="Package\.swift doesn't exist"
FIXES=(owner_two_step_git_mv)
WRONGS=(delete_resolved delete_everything bump_consumer_tools update)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9 package.swift
  fx_commit "manifest committed as package.swift" 1; fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"')"
}
# On a case-insensitive disk (the macOS default) a plain `mv package.swift Package.swift`
# followed by `git add -A` is not seen by git. Recorded as an observation below.
naive_rename() {
  mv "$FX/package.swift" "$FX/Package.swift"
  git -C "$FX" add -A
  echo "git status --short after mv + git add -A (empty means git saw no change):"
  git -C "$FX" status --short
  echo "name git still tracks: $(git -C "$FX" ls-files | grep -i '^package\.swift$')"
}
scenario_observe() { observe "naive rename on the case-insensitive disk" naive_rename; }
# git mv through a temporary name always records the new case.
fix_owner_two_step_git_mv() {
  git -C "$FX" mv package.swift Package.tmp
  git -C "$FX" mv Package.tmp Package.swift
  fx_commit "rename package.swift to Package.swift" 2; fx_tag 1.0.1
}
