# shellcheck shell=bash
TITLE="The only manifest is Package@swift-9.0.swift, which this toolchain ignores because 9.0 is newer than it, and there is no Package.swift"
EXPECT="Package\.swift doesn't exist"
FIXES=(owner_add_generic_manifest)
WRONGS=(delete_resolved delete_everything bump_consumer_tools update)

scenario_setup() {
  fx_new; write_src; write_manifest 5.9 "Package@swift-9.0.swift"
  fx_commit "only a version-specific manifest, for Swift 9.0 and later" 1; fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"')"
}
# A Package.swift next to it. The too-new Package@swift-9.0.swift stays in the tree and is
# ignored, which is what this fix proves: resolve and build succeed with both files present.
fix_owner_add_generic_manifest() { write_manifest 5.9; fx_commit "add the generic Package.swift" 2; fx_tag 1.0.1; }
