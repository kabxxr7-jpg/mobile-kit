# shellcheck shell=bash
TITLE="The shared cache's bare clone is missing a tree object (a partial clone): resolution succeeds, the checkout fails"
EXPECT="unable to read tree"
NEEDS_DAEMON=1
FIXES=(purge_cache_and_reset)
WRONGS=(delete_scratch purge_cache_only reset_only delete_resolved)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "1.0.0" 1; fx_tag 1.0.0
  consumer_init "$(dep_git 'from: "1.0.0"')"
  sw package resolve >/dev/null 2>&1
  cache_unpack
  cache_remove_object "1.0.0:Sources"
  safe_rm "$SCRATCH"
}
scenario_observe() { observe "git fsck on the cached clone" git -C "$(cache_clone)" fsck --no-progress; }
fix_purge_cache_and_reset() { sw package purge-cache; sw package reset; }       # both: the shared cache and the project clone made from it
wrong_purge_cache_only() { sw package purge-cache; }
