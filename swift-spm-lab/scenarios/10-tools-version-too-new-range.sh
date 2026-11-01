# shellcheck shell=bash
TITLE="Every release the version requirement allows needs a newer Swift tools version than the installed toolchain"
EXPECT="incompatible tools version"
FIXES=(client_pin_older_release owner_lower_tools_version)
WRONGS=(bump_consumer_tools delete_resolved update purge_cache)

scenario_setup() {
  fx_new; write_src
  write_manifest 5.9;  fx_commit "0.9.0, old tools version" 1; fx_tag 0.9.0
  write_manifest 99.0; fx_commit "1.0.0 requires a toolchain that does not exist yet" 2; fx_tag 1.0.0
  consumer_init "$(dep '"1.0.0"..<"2.0.0"')"
}
# A wider requirement silently skips the incompatible release and takes 0.9.0.
try_wider_requirement() {
  consumer_manifest "$(dep 'from: "0.9.0"')"; safe_rm "$SCRATCH"; rm -f "$CONS/Package.resolved"
  sw package resolve; local rc=$?
  grep '"version"' "$CONS/Package.resolved" | head -1
  return $rc
}
scenario_observe() { observe "requirement widened to from: 0.9.0" try_wider_requirement; }
fix_client_pin_older_release() { consumer_manifest "$(dep 'exact: "0.9.0"')"; }
fix_owner_lower_tools_version() { write_manifest 5.9; fx_commit "1.0.1 with a supported tools version" 3; fx_tag 1.0.1; }
