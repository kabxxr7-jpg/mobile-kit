# shellcheck shell=bash
TITLE="Package.resolved pins a tagged revision that no longer exists (tag moved, history rewritten); CI resolves with --force-resolved-versions"
EXPECT="check out revision"
RESOLVE_ARGS=(--force-resolved-versions)       # the flag CI uses; Xcode's equivalent is -onlyUsePackageVersionsFromResolvedFile
FIXES=(package_update regenerate_resolved)
WRONGS=(delete_resolved purge_cache bump_consumer_tools)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "1.0.0" 1; fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"')"
  sw package resolve >/dev/null 2>&1                       # the developer's first resolve writes Package.resolved
  fx_rewrite_history 5 1.0.0                               # owner amends the commit, moves tag 1.0.0 onto it, old commit is deleted
  safe_rm "$SCRATCH" "$CACHE"                              # a new machine or CI runner: no clones yet
}
# Without the flag SwiftPM silently re-pins instead of failing. Recorded so nobody mistakes
# "it resolved" for "the pin was still valid".
scenario_observe() {
  observe "without --force-resolved-versions (same state)" sw package resolve
  observe "revision Package.resolved holds afterwards" grep revision "$CONS/Package.resolved"
}
fix_package_update() { sw package update acmekit; }
fix_regenerate_resolved() { rm -f "$CONS/Package.resolved"; sw package resolve; }
