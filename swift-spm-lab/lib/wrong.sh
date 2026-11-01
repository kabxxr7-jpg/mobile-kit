# shellcheck shell=bash
# Sourced after lib/fixture.sh. Generic "wrong fixes": things people really do when a package
# will not resolve. run-scenario.sh applies one to a freshly broken world and then runs
# `swift package resolve`; the check passes only if resolve STILL FAILS. A wrong fix that
# resolves is reported as ACCEPTED and fails the verify run (it would mean the scenario
# does not test what it claims, or the "wrong" fix is actually right).
#
# A scenario lists the ones that apply in WRONGS=(...). It can add its own wrong_<name> functions.

wrong_delete_resolved() { rm -f "$CONS/Package.resolved"; }                 # "delete Package.resolved"
wrong_delete_scratch()  { safe_rm "$SCRATCH"; }                             # "delete .build" / "delete DerivedData"
wrong_purge_cache()     { sw package purge-cache; sw package reset; }       # "Reset Package Caches" + "Reset Package"
wrong_update()          { sw package update; }                              # "Update to Latest Package Versions"
wrong_bump_consumer_tools() {                                               # raise the CONSUMER's tools-version
  perl -pi -e 's/swift-tools-version: 5\.9/swift-tools-version: 6.0/' "$CONS/Package.swift"
}
wrong_delete_everything() {                                                 # scratch + cache + Package.resolved: the "clean everything" hammer
  safe_rm "$SCRATCH" "$CACHE"
  rm -f "$CONS/Package.resolved"
}
wrong_reset_only()      { sw package reset; }                               # "swift package reset": clears checkouts, not the shared cache
