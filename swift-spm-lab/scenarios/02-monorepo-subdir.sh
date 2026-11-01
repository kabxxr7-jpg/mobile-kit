# shellcheck shell=bash
TITLE="The package lives in a subdirectory (ios/Package.swift) of a monorepo; the repository root has no manifest"
EXPECT="Package\.swift doesn't exist"
FIXES=(client_path_dependency owner_root_manifest)
WRONGS=(delete_resolved bump_consumer_tools branch_main exact_version)

scenario_setup() {
  fx_new
  echo "# acme monorepo: the Swift package is in ios/" > "$FX/README.md"
  write_src ios; write_manifest 5.9 ios/Package.swift
  fx_commit "monorepo with the package in ios/" 1; fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"')"
}
# SwiftPM cannot take a subdirectory of a git URL. It can take a local path, so clone the
# repository next to the project (a git submodule or a checked-out copy does the same job).
# A path dependency's package identity is the last path component, here "ios".
fix_client_path_dependency() {
  mkdir -p "$WORLD/vendor"
  git clone -q "$FX" "$WORLD/vendor/acme-monorepo"
  consumer_manifest ".package(path: \"$WORLD/vendor/acme-monorepo/ios\")" ios
}
# The owner adds a manifest at the root whose target points into ios/.
fix_owner_root_manifest() {
  write_manifest 5.9 Package.swift "ios/Sources/AcmeKit"
  fx_commit "root manifest forwarding to ios/Sources/AcmeKit" 2; fx_tag 1.0.1
}
wrong_branch_main()  { consumer_manifest "$(dep 'branch: "main"')"; }       # no ref in this repo has a root manifest
wrong_exact_version() { consumer_manifest "$(dep 'exact: "1.0.0"')"; }
