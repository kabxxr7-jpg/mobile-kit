# shellcheck shell=bash
TITLE="The dependency is tracked by branch and the branch tip needs a newer Swift tools version than the installed toolchain"
EXPECT="is using Swift tools version"
FIXES=(client_branch_legacy client_use_tag owner_lower_tools_version)
WRONGS=(bump_consumer_tools delete_resolved update purge_cache)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "stable" 1; fx_tag 1.0.0; git -C "$FX" branch legacy
  write_manifest 99.0; fx_commit "main moved to a future tools version" 2
  consumer_init "$(dep 'branch: "main"')"
}
fix_client_branch_legacy() { consumer_manifest "$(dep 'branch: "legacy"')"; }
fix_client_use_tag() { consumer_manifest "$(dep 'from: "1.0.0"')"; }
fix_owner_lower_tools_version() { write_manifest 5.9; fx_commit "main back to a supported tools version" 3; }
