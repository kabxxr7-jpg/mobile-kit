# shellcheck shell=bash
TITLE="The dependency tracks branch 'master', which the owner renamed to 'main': fine on the developer's machine, fails on a fresh checkout"
EXPECT="could not find a branch named"
FIXES=(client_branch_main client_use_tag)
WRONGS=(purge_cache update bump_consumer_tools)

scenario_setup() {
  fx_new; git -C "$FX" symbolic-ref HEAD refs/heads/master
  write_src; write_manifest 5.9
  fx_commit "first version on master" 1; fx_tag 1.0.0
  consumer_init "$(dep 'branch: "master"')"
  sw package resolve >/dev/null 2>&1
  git -C "$FX" branch -m master main                       # the owner renames the branch
  observe "developer machine (existing scratch directory): no output, nothing to do" sw package resolve
  safe_rm "$SCRATCH" "$CACHE" "$CONS/Package.resolved"     # fresh checkout; Package.resolved is not committed for this dependency
}
fix_client_branch_main() { consumer_manifest "$(dep 'branch: "main"')"; }
fix_client_use_tag() { consumer_manifest "$(dep 'from: "1.0.0"')"; }
