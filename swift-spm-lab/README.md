# Swift Package Manager recovery lab

> **Status:** ran on 2026-11-01 on macOS 27.2 (arm64) with Apple Swift 6.4.2 from Xcode 27.2 (selected with `DEVELOPER_DIR`) and git 2.51.1. `./verify.sh` ran 17 deliberately broken situations plus one healthy control, all with local git fixtures: **28 of 28 fixes resolved and built, 63 of 63 wrong fixes were refused**, the real SwiftPM/Xcode locations were unchanged by the run, nothing was left mounted or listening (about 7.5 minutes). The optional real-SDK check resolved Firebase 13.1.1 and Facebook 9.3.0 without any `Package.swift` error (see "Real SDKs"). **Host-only:** `swift package`, `swift build` and `swift test` on macOS. Not run on a client project, not driven through Xcode's UI, no `xcodebuild`, no simulator or device, no CocoaPods or Carthage, no binary-target checksum failure, not in CI. See Limits below.

A lab that **reproduces on purpose** the family of failures behind job posts like "Swift Package resolution fails: Package.swift doesn't exist" (Firebase, Facebook SDK, any Swift package), keeps the **real tool output** of each, and applies a **verified fix** to each. It also proves that the usual wrong fixes ("delete Package.resolved", "reset the cache", "bump the tools version") do not help when they are not the cause. The ordered checklist built from it is [`docs/RECOVERY-CHECKLIST.md`](docs/RECOVERY-CHECKLIST.md).

All dependencies are **local git repositories** created by the scripts, so the whole lab runs offline.

## Run it

Requirements: macOS, Xcode (this lab was written against Xcode 27.2 with Swift 6.4.2), git. No network, no simulator, no sudo, no Homebrew.

`xcode-select` may still point at the Command Line Tools, and changing it needs sudo, so every script selects Xcode **per process** with `DEVELOPER_DIR`. The scripts default to `/Applications/Xcode.app/Contents/Developer`; to use another Xcode:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer   # or the path of your Xcode
cd swift-spm-lab
./verify.sh                 # every scenario: break, capture, fix, wrong fixes; prints the table; about 8 minutes
./verify.sh --list          # scenario names
./verify.sh --only monorepo-subdir,branch-deleted
./verify.sh --no-record     # do not rewrite docs/errors and docs/RESULTS.md
./run-scenario.sh url-typo  # one scenario, all phases
```

`verify.sh` exits 0 only if: every broken scenario failed with the documented message, every fix resolved **and** built, every wrong fix was refused, the real SwiftPM/Xcode locations are unchanged, and no mount or git daemon was left behind. It rewrites `docs/errors/*.txt` and `docs/RESULTS.md`; `git diff` then shows whether the tool printed different text than last time (for instance on another Xcode).

A scenario is one file in `scenarios/` with: `scenario_setup` (builds the fixture repositories and the consumer in the broken state), `FIXES` (each a `fix_<name>` function), `WRONGS` (each a `wrong_<name>` function, generic ones live in `lib/wrong.sh`), and the regular expression the real message must match. `run-scenario.sh` does the rest, always from a freshly built world.

## What is in the box

| Piece | What it is |
|---|---|
| `consumer-template/` | A tiny Swift package, `LabKit` (a library plus an XCTest target), that depends on the fixture package `AcmeKit` and whose test only passes if the dependency was really fetched and linked. `swift test` passes in the control scenario. |
| `scenarios/` | 18 scenarios (one healthy control and 17 broken situations), each with fixes and wrong fixes |
| `lib/fixture.sh` | The fixture builder: local git repositories with fixed identities and dates, so commit hashes are identical on every run |
| `lib/env.sh` | The isolated environment (see below) |
| `docs/errors/<name>.txt` | The tool's real output for each scenario: `swift package resolve`, then `swift build` in the same state, then observations |
| `docs/RESULTS.md` | The table from the last full `verify.sh` run |
| `docs/RECOVERY-CHECKLIST.md` | The ordered checklist, every step tied to the scenario that proves it or marked as knowledge only |
| `tools/isolation-snapshot.sh` | Lists the real SwiftPM/Xcode locations, so a before/after diff can show nothing changed |
| `tools/real-sdk-resolve.sh` | Optional: resolves (not builds) the real Firebase and Facebook SDKs. See "Real SDKs" |

## Isolation

The lab must never touch the real SwiftPM or Xcode caches. Every `swift` call runs with `--scratch-path`, `--cache-path`, `--config-path` and `--security-path` pointing into the scenario's own folder under `.work/` (git-ignored), **and** with `HOME` and `TMPDIR` pointed into `.work/` as well. The second part matters:

> On this toolchain the four path flags alone are **not enough**. `swift package` creates `~/.swiftpm` and `~/Library/org.swift.swiftpm` at start-up even when all four flags are given, and `swift package <subcommand> --help` loads the manifest into the real `~/Library/Caches/org.swift.swiftpm`. This was found the hard way: exploratory commands run before the lab existed, with the flags but without a `HOME` override, created those directories in the real home (`~/.swiftpm`, `~/Library/org.swift.swiftpm`, and a manifest cache under `~/Library/Caches/org.swift.swiftpm`). With `HOME` overridden nothing is created there.

`verify.sh` takes a read-only listing of these places before and after the run and diffs them: `~/Library/Caches/org.swift.swiftpm`, `~/Library/org.swift.swiftpm`, `~/.swiftpm`, `~/Library/Developer/Xcode/DerivedData`, and the clang module cache folders. It does not look at, and the lab never touches, `~/Library/Developer/CoreSimulator`. Every deletion in the scripts goes through `safe_rm`, which refuses any path outside `.work/`. `git` runs without the user's or system git config.

Two things the lab starts besides `swift`, both inside the scenario that needs them and stopped afterwards, with a check at the end:

* a `git daemon` on `127.0.0.1` (loopback only, ports from 41873) for the two shared-cache scenarios. Reason: SwiftPM does **not** use the shared cache for `file://` repositories (checked: the cache folder then holds only `manifests/`). A repository served over `git://` counts as remote, so its bare clone lands in `--cache-path/repositories` just like a GitHub one, and "damage the cached clone" is real.
* a 40 MB case-sensitive APFS disk image mounted inside the scenario folder (`hdiutil`, no sudo), for the one scenario about case sensitivity. Detached when the scenario ends.

## Scenarios and what the real tool said

| # | Scenario (what is broken) | First line of the real error | `Package.swift` in it | Verified fixes | Wrong fixes refused |
|---|---|---|---|---|---|
| 00 | **baseline**: Control: a healthy dependency resolves, builds, and the consumer's test passes | (none: resolve, build and `swift test` succeed) | no | - | - |
| 01 | **tag-missing-manifest**: Tag 1.1.0 points at a commit that has no Package.swift (the manifest was left out of that commit) | `error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in file system)` | yes | 2/2: `owner_new_tag`, `client_stay_below` | 4/4 |
| 02 | **monorepo-subdir**: The package lives in a subdirectory (ios/Package.swift) of a monorepo; the repository root has no manifest | `error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in file system)` | yes | 2/2: `client_path_dependency`, `owner_root_manifest` | 4/4 |
| 03 | **manifest-case-lower**: The manifest is committed as package.swift (lower case); SwiftPM reads it from the git tree, which is case-sensitive | `error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in file system)` | yes | 1/1: `owner_two_step_git_mv` | 4/4 |
| 04 | **manifest-case-mixed**: The manifest is committed as Package.Swift (capital S in the extension) | `error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in file system)` | yes | 1/1: `owner_two_step_git_mv` | 3/3 |
| 05 | **manifest-case-local-path**: A local path dependency with package.swift works on this Mac and fails on a case-sensitive disk (stand-in for a Linux CI runner) | `error: the package manifest at '<LAB>/.../manifest-case-local-path/csvol/fixtures/AcmeKit/Package.swift' cannot be accessed (<LAB>/.../manifest-cas...` | yes | 1/1: `rename_to_exact_case` | 3/3 |
| 06 | **future-version-manifest**: The only manifest is Package@swift-9.0.swift, which this toolchain ignores because 9.0 is newer than it, and there is no Package.swift | `error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in file system)` | yes | 1/1: `owner_add_generic_manifest` | 4/4 |
| 07 | **pinned-revision-gone-tag**: Package.resolved pins a tagged revision that no longer exists (tag moved, history rewritten); CI resolves with --force-resolved-versions | `error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f5463ea0ee5’:` | no | 2/2: `package_update`, `regenerate_resolved` | 3/3 |
| 08 | **pinned-revision-gone-branch**: Package.resolved pins a commit of a branch that was force-pushed; the pinned commit no longer exists | `error: could not find the commit 70c96522a51a603f0527f71055d90cfdf3a45c99 in <LAB>/.../pinned-revision-gone-branch/fixtures/AcmeKit` | no | 2/2: `package_update`, `regenerate_resolved` | 3/3 |
| 09 | **branch-deleted**: The dependency tracks branch 'master', which the owner renamed to 'main': fine on the developer's machine, fails on a fresh checkout | `error: could not find a branch named ‘master’ in <LAB>/.../branch-deleted/fixtures/AcmeKit (did you mean ‘main’?)` | no | 2/2: `client_branch_main`, `client_use_tag` | 3/3 |
| 10 | **tools-version-too-new-range**: Every release the version requirement allows needs a newer Swift tools version than the installed toolchain | `error: Dependencies could not be resolved because root depends on 'acmekit' 1.0.0..<2.0.0.` | no | 2/2: `client_pin_older_release`, `owner_lower_tools_version` | 4/4 |
| 11 | **tools-version-too-new-branch**: The dependency is tracked by branch and the branch tip needs a newer Swift tools version than the installed toolchain | `error: package 'acmekit' @ 32201263a9986404b5ac13c01add31f6425fc2bb is using Swift tools version 99.0.0 but the installed version is 6.4.2 in <LAB>...` | no | 3/3: `client_branch_legacy`, `client_use_tag`, `owner_lower_tools_version` | 4/4 |
| 12 | **cache-missing-manifest-blob**: The shared cache's bare clone is damaged (the Package.swift object is missing) while refs and commits look fine | `error: the package manifest at '/Package.swift' cannot be accessed (Couldn’t read ‘a0a930563604b18ebcf8285513e8def168dea404’:` | yes | 2/2: `purge_cache_and_reset`, `remove_clone_and_scratch` | 5/5 |
| 13 | **cache-missing-tree**: The shared cache's bare clone is missing a tree object (a partial clone): resolution succeeds, the checkout fails | `error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f5463ea0ee5’:` | no | 1/1: `purge_cache_and_reset` | 4/4 |
| 14 | **url-typo**: The dependency URL has a typo in the owner part of its path, so the repository does not exist there | `error: Failed to clone repository <LAB>/.../url-typo/fixtures/acme-cp/AcmeKit:` | no | 1/1: `correct_the_url` | 4/4 |
| 15 | **url-typo-package-name**: The URL has a typo in the repository name, so the package identity no longer matches the product reference | `error: 'consumer': unknown package 'AcmeKit' in dependencies of target 'LabKit'; valid packages are: 'AcmeKitt' (at '<LAB>/.../url-typo-package-nam...` | no | 1/1: `correct_the_url` | 3/3 |
| 16 | **repo-moved**: The repository moved to a new location; the old URL no longer exists (fine on a machine that already cloned it) | `error: Failed to clone repository <LAB>/.../repo-moved/fixtures/old/AcmeKit:` | no | 2/2: `client_update_url`, `client_set_mirror` | 4/4 |
| 17 | **no-matching-tag**: The repository has tags, but none of them is a semantic version (v1, release-1.0, CocoaPods-1.0.0) | `error: Dependencies could not be resolved because no versions of 'acmekit' match the requirement 1.0.0..<2.0.0 and root depends on 'acmekit' 1.0.0....` | no | 2/2: `owner_add_semver_tag`, `client_use_revision` | 4/4 |

The first line of the real message is shown; the complete text, including the `swift build` run in the same state and the observations, is in `docs/errors/<name>.txt`. The only changes made to the tool's text are listed in the header of each file (the lab path becomes `<LAB>`, the port `<PORT>`, the clone hash `<hash>`, durations `<t>`, progress counters are dropped).

### Findings worth knowing

* **7 of the 17 broken situations print `Package.swift`; 10 do not.** Five print the same plain line (tag without a manifest, manifest in a subdirectory, `package.swift`, `Package.Swift`, only a too-new `Package@swift-9.0.swift`), one prints it with a full path (the case-sensitive disk), one prints it with a different tail (`Couldn’t read ‘<sha>’`, a damaged cache). The other ten fail with other texts: `Couldn’t check out revision`, `could not find the commit`, `could not find a branch`, `incompatible tools version`, `Failed to clone repository`, `unknown package`, `no versions ... match`. A client who writes "Package.swift doesn't exist" may be looking at any of these.
* **The plain `Package.swift` message cannot tell its five causes apart and does not name the package.** `'/Package.swift'` is a path inside the git tree, always the root. The dependency is in the line above it (`Computing version for <URL>`).
* **Case: git dependencies fail even on a case-insensitive Mac; path dependencies do not.** SwiftPM reads a git dependency's manifest from git's objects, where names are case-sensitive, so `package.swift` and `Package.Swift` fail on macOS. A local path dependency (or root package) with `package.swift` resolves on the default case-insensitive volume and fails on a case-sensitive one. And on a case-insensitive disk, `mv package.swift Package.swift` plus `git add -A` is not seen by git (it kept tracking `package.swift`); the rename needs `git mv` through a temporary name.
* **No fallback to an older tag.** When the newest tag in range has no manifest, resolve fails; it does not try 1.0.0. A release that needs a newer *tools version* is different: with an older compatible release in range it is skipped silently (`from: "0.9.0"` resolved 0.9.0 and ignored 1.0.0), and only fails when nothing in range is compatible.
* **A too-new `Package@swift-X.swift` is ignored, not an error**, as long as a `Package.swift` exists beside it. It only hurts when it is the only manifest.
* **`Package.resolved` with a vanished commit: plain mode self-heals, lock-file mode fails.** For a tagged dependency plain `swift package resolve` re-pins silently (exit 0) and rewrites `Package.resolved`; `--force-resolved-versions` (the CI mode) fails with `Couldn’t check out revision`, and deleting `Package.resolved` there is refused with `a resolved file is required`. A pin on a branch failed already in plain mode.
* **"Works on my machine" is the normal shape of three scenarios.** After the owner renamed the branch, or moved the repository, `swift package resolve` on the developer's existing checkout exited 0 and printed nothing; only a fresh checkout failed (observations in `branch-deleted` and `repo-moved`).
* **`file://` repositories bypass the shared cache** (the cache folder then holds only `manifests/`). The cache scenarios therefore use a loopback `git daemon`.
* **A damaged cache damages the project too.** Once a resolve ran against the damaged cache, the project's own scratch clone is damaged as well, so `swift package purge-cache` alone and `swift package reset` alone were both refused; the pair fixed it. Other cache damage tried while building the lab (deleted `HEAD`, refs or objects, a pack with every byte flipped) did not fail at all: SwiftPM printed `warning: skipping cache due to an error` and re-cloned.
* **A mirror needs the form SwiftPM normalises to.** With `file://` fixtures `set-mirror --original` matched only the plain path form, not the `file://` URL as written in `Package.swift`. (With https URLs, use the https URL; not tested here.)
* **The four path flags do not isolate SwiftPM from the real home.** See "Isolation".

## Wrong fixes are refused

For every scenario, `verify.sh` rebuilds the broken situation, applies one wrong fix, runs `swift package resolve`, and counts the wrong fix as **refused** only if resolve still fails. A wrong fix that makes resolve succeed is reported as ACCEPTED and fails the run: either the scenario does not test what it claims or the "wrong" fix was actually a fix. Last run: **63 of 63 wrong fixes refused**. The list is in `docs/RESULTS.md`. Generic wrong fixes: delete `Package.resolved`; delete the scratch directory (what "delete `.build`" or "delete DerivedData" does); `swift package purge-cache` plus `reset` ("Reset Package Caches"); `swift package update`; raise the consumer's own `swift-tools-version`; delete scratch, cache and `Package.resolved` together; `swift package reset` alone. Scenario-specific ones: switch to `branch: "main"` or `exact:` when the problem is the path; lower the requirement when there are no semver tags.

This is a mutation-style check of the **advice**, not of the lab's code: it shows that each listed wrong fix leaves resolution broken in that situation, not that these are the only wrong fixes.

## Real SDKs

Done once (optional part, disk was 55 GiB free, far above the 14 GiB floor): `tools/real-sdk-resolve.sh 13.1.1 9.3.0` ran `swift package resolve` (no build) for the real `firebase-ios-sdk` 13.1.1 and `facebook-ios-sdk` 9.3.0 (products `FirebaseAuth` and `FacebookLogin`) from github.com, in the isolated paths. **It did not reproduce a `Package.swift` error**: exit 0, no `Package.swift` in the output, no error or warning lines, 14 packages pinned, 9 binary artifacts downloaded without error. 218 seconds; about 2.3 GiB on disk while it existed (free disk 55 to 53 GiB), all of it deleted afterwards (back to 55 GiB). Full output and the table: [`docs/REAL-SDK-RESOLVE.md`](docs/REAL-SDK-RESOLVE.md). The real-home locations were unchanged afterwards (same check as `verify.sh`).

So "Package.swift doesn't exist" for these SDKs is not a defect of the SDKs at these versions; it comes from the client's project (a tag, path, case, cache or pin, as in the scenarios). This run says nothing about older versions, other products, a build, or Xcode.

## Limits, and what this does not prove

* **Not run on a client project.** Every situation is a small fixture built by these scripts. Real SDKs have much larger graphs, binary targets, submodules and private hosts.
* **Not driven through Xcode's UI.** `xcodebuild` was not run at all, and Xcode's menu items (File > Packages > Reset Package Caches, Resolve Package Versions, Update to Latest Package Versions) were not clicked. The checklist marks them "not run: Xcode UI". Xcode uses the same SwiftPM engine, but its message wording, clone locations (`DerivedData/<project>/SourcePackages`) and flags can differ from the command line text recorded here.
* **No simulator, no device, no iOS build.** The consumer lists `.iOS(.v16)` as a platform, but only the macOS host was built and tested (`swift build`, `swift test`). A successful build here says nothing about an iOS app target.
* **No CocoaPods, no Carthage.**
* **No binary-target (xcframework) checksum failures.** Not tested, so not claimed. Firebase and Facebook use binary targets; a checksum or download failure there is a different family from everything above.
* **No authentication, SSH, proxies or rate limits.** The fixtures are local and anonymous.
* **Git submodules inside a dependency are not covered.**
* **Case sensitivity on Linux is not tested on Linux.** A case-sensitive APFS disk image stands in for a Linux CI runner; it reproduces the file-system rule, not the rest of Linux.
* **Message texts are those of Swift 6.4.2 only.** Older and newer SwiftPM versions word things differently (the lab shows the real text, it does not claim stability). `docs/errors` records which toolchain printed each file.
* **The shared-cache damage is simulated** (the packed cache clone is unpacked into loose objects and single objects are removed). The shape matches what a partial clone leaves behind, but it is not a recording of a real disk or network failure. Other kinds of damage that were tried while building the lab (deleted `HEAD`, deleted refs, deleted objects directory, a pack with every byte flipped) did **not** fail: SwiftPM printed `warning: skipping cache due to an error` and re-cloned from the server. They are not scenarios because they end in success.
* **One run on one machine.** Run once on the date in the Status line. Not run on CI. Not run on Apple silicon other than the one it was written on, nor on Intel.
* **The lab is not a product.** It is evidence of a method (read the exact message, check the host, change one thing, prove the fix, prove the wrong fixes fail), plus a set of tested commands.

## CI

`.github/workflows/ci.yml` (the Expo and mock-API checks) **does not run this lab** and the lab has never run on GitHub Actions. A macOS job (`runs-on: macos-latest`, `bash swift-spm-lab/verify.sh --no-record`) was deliberately **not added**: it has not been tried, and a runner's Xcode would print some different texts. If someone adds it, expect the first run to need review.

## Layout

```
swift-spm-lab/
  verify.sh                 run everything, print the table
  run-scenario.sh           one scenario
  consumer-template/        the consumer package (Package.swift.in, Sources, Tests)
  scenarios/NN-name.sh      one file per situation
  lib/                      env.sh (isolation), fixture.sh, capture.sh, wrong.sh
  tools/                    isolation-snapshot.sh, real-sdk-resolve.sh
  docs/                     RECOVERY-CHECKLIST.md, RESULTS.md, errors/<name>.txt
  .work/                    everything generated (git-ignored): fixtures, scratch, caches, fake HOME
```
