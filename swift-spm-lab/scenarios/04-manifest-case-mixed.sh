# shellcheck shell=bash
TITLE="The manifest is committed as Package.Swift (capital S in the extension)"
EXPECT="Package\.swift doesn't exist"
FIXES=(owner_two_step_git_mv)
WRONGS=(delete_resolved purge_cache bump_consumer_tools)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9 Package.Swift
  fx_commit "manifest committed as Package.Swift" 1; fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"')"
}
fix_owner_two_step_git_mv() {
  git -C "$FX" mv Package.Swift Package.tmp
  git -C "$FX" mv Package.tmp Package.swift
  fx_commit "rename Package.Swift to Package.swift" 2; fx_tag 1.0.1
}
