# shellcheck shell=bash
TITLE="The repository has tags, but none of them is a semantic version (v1, release-1.0, CocoaPods-1.0.0)"
EXPECT="no versions of 'acmekit' match the requirement"
FIXES=(owner_add_semver_tag client_use_revision)
WRONGS=(delete_resolved purge_cache update lower_requirement)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "release" 1; fx_tag v1; fx_tag release-1.0; fx_tag CocoaPods-1.0.0
  consumer_init "$(dep 'from: "1.0.0"')"
}
fix_owner_add_semver_tag() { fx_tag 1.0.0; }
fix_client_use_revision() { consumer_manifest "$(dep "revision: \"$(fx_rev)\"")"; }
wrong_lower_requirement() { consumer_manifest "$(dep 'from: "0.0.1"')"; }
