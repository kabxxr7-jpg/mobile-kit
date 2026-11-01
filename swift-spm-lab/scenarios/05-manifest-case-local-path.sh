# shellcheck shell=bash
TITLE="A local path dependency with package.swift works on this Mac and fails on a case-sensitive disk (stand-in for a Linux CI runner)"
EXPECT="Package\.swift doesn't exist in file system"
NEEDS_CS=1
FIXES=(rename_to_exact_case)
WRONGS=(delete_resolved purge_cache bump_consumer_tools)

scenario_setup() {
  mkdir -p "$FX"; write_src; write_manifest 5.9 package.swift     # no git involved at all
  consumer_init ".package(path: \"$FX\")"
}
# Same files, same consumer, but on the default (case-insensitive) volume of this Mac.
default_volume_control() {
  local d="$WORLD/default-volume/AcmeKit"
  mkdir -p "$d"; cp -R "$FX/." "$d/"
  ( CONS="$WORLD/default-volume/consumer"; SCRATCH="$WORLD/default-volume/scratch"
    consumer_init ".package(path: \"$d\")"
    echo "disk of this control: $(touch "$d/probe" && { [ -e "$d/PROBE" ] && echo case-insensitive || echo case-sensitive; }; rm -f "$d/probe")"
    sw package resolve
    rc=$?; echo "(resolve exit $rc)"; exit $rc )
}
scenario_observe() { observe "same package on the default volume" default_volume_control; }
fix_rename_to_exact_case() { mv "$FX/package.swift" "$FX/Package.swift"; }
