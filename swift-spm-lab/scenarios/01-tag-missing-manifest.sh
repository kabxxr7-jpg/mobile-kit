# shellcheck shell=bash
TITLE="Tag 1.1.0 points at a commit that has no Package.swift (the manifest was left out of that commit)"
EXPECT="Package\.swift doesn't exist"
FIXES=(owner_new_tag client_stay_below)
WRONGS=(delete_resolved delete_everything bump_consumer_tools update)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "1.0.0 with a manifest" 1; fx_tag 1.0.0
  git -C "$FX" rm -q Package.swift
  fx_commit "1.1.0: the manifest is missing from this commit" 2; fx_tag 1.1.0
  consumer_init "$(dep 'from: "1.0.0"')"
}
# The dependency's owner publishes a new tag whose commit has the manifest. (Moving tag 1.1.0
# would also work for a fresh machine, but breaks every machine that already cached the old commit.)
fix_owner_new_tag() { write_manifest 5.9; fx_commit "1.1.1: manifest restored" 3; fx_tag 1.1.1; }
# The consumer does not wait for the owner: stay below the broken release.
fix_client_stay_below() { consumer_manifest "$(dep '.upToNextMinor(from: "1.0.0")')"; }
