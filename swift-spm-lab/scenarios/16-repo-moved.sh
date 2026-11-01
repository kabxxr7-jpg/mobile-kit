# shellcheck shell=bash
TITLE="The repository moved to a new location; the old URL no longer exists (fine on a machine that already cloned it)"
EXPECT="Failed to clone repository"
FIXES=(client_update_url client_set_mirror)
WRONGS=(delete_resolved purge_cache delete_scratch update)

scenario_setup() {
  fx_dir_set "$WORLD/fixtures/old"
  fx_new; write_src; write_manifest 5.9
  fx_commit "1.0.0" 1; fx_tag 1.0.0
  OLD_REPO="$FX"; NEW_REPO="$WORLD/fixtures/new/AcmeKit"
  consumer_init "$(dep 'from: "1.0.0"')"
  sw package resolve >/dev/null 2>&1
  mkdir -p "$WORLD/fixtures/new"; mv "$WORLD/fixtures/old/AcmeKit" "$NEW_REPO"   # the move
  observe "developer machine (existing scratch directory): no output, nothing to do" sw package resolve
  safe_rm "$SCRATCH" "$CACHE"
}
fix_client_update_url() { consumer_manifest "$(dep 'from: "1.0.0"' "$NEW_REPO")"; }
# A mirror redirects one URL to another without touching Package.swift. For file:// fixtures the
# key is the path form of the URL (that is what SwiftPM normalises it to); with https URLs it is the https URL.
fix_client_set_mirror() { sw package config set-mirror --original "$OLD_REPO" --mirror "$NEW_REPO"; }
