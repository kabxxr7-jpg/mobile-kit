# shellcheck shell=bash
TITLE="The dependency URL has a typo in the owner part of its path, so the repository does not exist there"
EXPECT="Failed to clone repository"
FIXES=(correct_the_url)
WRONGS=(delete_resolved purge_cache update delete_everything)

scenario_setup() {
  fx_dir_set "$WORLD/fixtures/acme-co"                     # the real repository: .../acme-co/AcmeKit
  fx_new; write_src; write_manifest 5.9
  fx_commit "1.0.0" 1; fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"' "$WORLD/fixtures/acme-cp/AcmeKit")"   # acme-cp: one letter off
}
fix_correct_the_url() { consumer_manifest "$(dep 'from: "1.0.0"')"; }
