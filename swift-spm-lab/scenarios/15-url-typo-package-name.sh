# shellcheck shell=bash
TITLE="The URL has a typo in the repository name, so the package identity no longer matches the product reference"
EXPECT="unknown package 'AcmeKit'"
FIXES=(correct_the_url)
WRONGS=(delete_resolved purge_cache update)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "1.0.0" 1; fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"' "$FX_DIR/AcmeKitt")"                 # AcmeKitt: one letter too many
}
fix_correct_the_url() { consumer_manifest "$(dep 'from: "1.0.0"')"; }
