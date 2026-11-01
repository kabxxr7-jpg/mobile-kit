# shellcheck shell=bash
TITLE="The shared cache's bare clone is damaged (the Package.swift object is missing) while refs and commits look fine"
EXPECT="the package manifest at '/Package\.swift' cannot be accessed"
NEEDS_DAEMON=1
FIXES=(purge_cache_and_reset remove_clone_and_scratch)
WRONGS=(delete_scratch purge_cache_only reset_only delete_resolved bump_consumer_tools)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "1.0.0" 1; fx_tag 1.0.0
  echo "// 1.1.0" >> "$FX/Sources/AcmeKit/AcmeKit.swift"; fx_commit "1.1.0" 2; fx_tag 1.1.0
  consumer_init "$(dep_git 'from: "1.0.0"')"
  sw package resolve >/dev/null 2>&1                       # healthy: fills CACHE/repositories
  cache_unpack                                             # a partial clone is simulated by removing single objects
  cache_remove_object "1.1.0:Package.swift"
  safe_rm "$SCRATCH"                                       # "delete DerivedData": the new clone is made from the cache
}
scenario_observe() { observe "git fsck on the cached clone" git -C "$(cache_clone)" fsck --no-progress; }
# Two places hold the damage. The shared cache has the broken clone, and the failed attempt already
# copied it into the project's own scratch directory (what DerivedData/<project>/SourcePackages is
# in Xcode). Both have to go: purge-cache alone and reset alone were each tried and refused.
fix_purge_cache_and_reset() { sw package purge-cache; sw package reset; }
fix_remove_clone_and_scratch() { safe_rm "$(cache_clone)" "$SCRATCH"; }
wrong_purge_cache_only() { sw package purge-cache; }
