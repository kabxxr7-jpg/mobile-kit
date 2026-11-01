# shellcheck shell=bash
TITLE="Package.resolved pins a commit of a branch that was force-pushed; the pinned commit no longer exists"
EXPECT="could not find the commit"
FIXES=(package_update regenerate_resolved)
WRONGS=(delete_scratch purge_cache bump_consumer_tools)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "main, first version" 1
  consumer_init "$(dep 'branch: "main"')"
  sw package resolve >/dev/null 2>&1                       # Package.resolved now pins that commit
  fx_rewrite_history 5                                     # force-push: the old commit is gone from the server
  safe_rm "$SCRATCH" "$CACHE"                              # fresh machine
}
fix_package_update() { sw package update acmekit; }
fix_regenerate_resolved() { rm -f "$CONS/Package.resolved"; sw package resolve; }
