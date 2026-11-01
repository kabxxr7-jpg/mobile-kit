# Swift package resolution recovery checklist

For jobs that start with "Swift Package resolution fails", "Package.swift doesn't exist", "Couldn't check out revision", "Xcode cannot resolve Firebase / Facebook SDK". Work top to bottom. Stop at the first step that explains the message.

Every step is tagged:

* **[verified: scenario]** the lab in this folder reproduced the situation with local git fixtures on Swift 6.4.2 (Xcode 27.2, macOS 27.2, `swift package` on the command line) and the step fixed it or told the causes apart. The scenario name points at `scenarios/NN-<name>.sh` and `docs/errors/<name>.txt`, which holds the exact tool output.
* **[knowledge only]** I know it from documentation or general experience and did not reproduce it here. A strong hint, not a finding.
* **[not run: Xcode UI]** an Xcode menu or button. Xcode's UI was never driven; `xcodebuild` was never run either.

The lab used SwiftPM from the command line, not Xcode. Xcode runs the same SwiftPM engine, but the wording of its messages, where it keeps its clones (`DerivedData/<project>/SourcePackages`) and which flags it passes can differ. Say so to the client if their screenshot looks different from the text below.

## 0. Collect, change nothing yet

1. The **full** error text (not a screenshot of the red badge; the Report navigator, "Resolve Package Graph" log, or the terminal). [knowledge only]
2. `xcodebuild -version` and `swift --version` (the toolchain decides tools-version support, step 5). [verified: tools-version-too-new-branch prints the installed version in its message]
3. Whether it fails on a developer machine, on CI, or only on a fresh clone. "Works for me, fails on CI" has four different causes in this checklist (pins, deleted branch, moved repository, case-sensitive disk); the answer picks the branch. [verified, as recorded observations: branch-deleted and repo-moved (the developer's existing checkout exits 0 and prints nothing, a fresh one fails), pinned-revision-gone-tag (plain mode re-pins silently, lock-file mode fails), manifest-case-local-path (default volume passes, case-sensitive volume fails)]
4. Is `Package.resolved` committed? Xcode: `<project>.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`. [knowledge only]

## 1. Read the exact message and say which dependency it is about

**The Package.swift message does not name the package.** This is the whole text SwiftPM printed for five different root causes:

```
error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in file system)
```

`'/Package.swift'` is a path inside the repository's git tree, so it is always the root. The dependency is named only in the line **above** it (`Computing version for <URL>`), or, for branch and revision requirements, at the end of the message (`... in <URL>`). Read that URL first. [verified: tag-missing-manifest, monorepo-subdir, manifest-case-lower, manifest-case-mixed, future-version-manifest, and the `in <URL>` form in monorepo-subdir's wrong fix `branch_main`]

Then match the message to a cause. All of these are real text from `docs/errors/`:

| Message (first line) | Cause | Go to |
|---|---|---|
| `the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in file system)` | The tag, branch or revision has no file called exactly `Package.swift` at the repository root | Step 2 |
| `the package manifest at '/Package.swift' cannot be accessed (Couldn’t read ‘<sha>’: fatal: Not a valid object name <sha>)` | The manifest exists in git, but the local cached clone lost that object | Step 6 |
| `Couldn’t check out revision ‘<sha>’: fatal: unable to read tree (<id>)` | Either the revision in `Package.resolved` no longer exists on the server, or the cached clone is partial. Tell them apart by the id in the parentheses: it is the same as the revision when the commit itself is gone, and a different id (a tree) when the clone is partial [verified: pinned-revision-gone-tag vs cache-missing-tree] | Steps 4 and 6 |
| `could not find the commit <sha> in <URL>` | `Package.resolved` pins a commit of a branch that was rewritten | Step 4 |
| `could not find a branch named ‘master’ in <URL> (did you mean ‘main’?)` | The branch was renamed or deleted | Step 2 |
| `... contains incompatible tools version (99.0.0)` / `is using Swift tools version 99.0.0 but the installed version is 6.4.2` | The dependency needs a newer Swift than the installed one | Step 5 |
| `Failed to clone repository <URL>: fatal: repository '<URL>' does not exist` | URL typo or repository moved | Step 3 |
| `unknown package 'X' in dependencies of target 'Y'; valid packages are: ...` | Typo in the repository name part of a URL in a `Package.swift` | Step 3 |
| `no versions of 'x' match the requirement ...` and no other cause | The repository has no tag that is a semantic version in range | Step 2 |

## 2. Check the tag, branch and path on the host

Do this on the host (GitHub or the client's server) or with `git`, not in Xcode. Clone the repository somewhere temporary (`git clone --bare <URL> /tmp/dep.git`) and look at what the **tag** contains, not what the default branch contains:

```bash
git ls-remote --tags <URL>                                    # which tags exist, and are they x.y.z? (no clone needed)
git -C /tmp/dep.git ls-tree --name-only <tag>                 # is there a file called exactly Package.swift?
git -C /tmp/dep.git ls-tree --name-only <tag> | grep -i '^package'   # any near-miss: package.swift, Package.Swift, Package@swift-9.0.swift
git -C /tmp/dep.git branch -a                                 # does the branch the project asks for still exist?
```

[knowledge only for these exact commands; the lab's equivalent checks are `git ls-files` and `git status` inside the fixture repository]

What the listing tells you:

* **No `Package.swift` at the root of that tag, but one in a subdirectory** (for example `ios/Package.swift`): monorepo. SwiftPM cannot use a subdirectory of a git URL. [verified: monorepo-subdir] Fix on the client side: check the repository out next to the project (git submodule or a vendored copy) and depend on it by **path** to the subdirectory, `.package(path: "vendor/acme/ios")`. Note that a path dependency's package identity is the last path component, so the product line must say `package: "ios"`. [verified: monorepo-subdir, `client_path_dependency`] Fix on the owner's side: a root `Package.swift` whose target says `path: "ios/Sources/..."`, released as a new tag. [verified: monorepo-subdir, `owner_root_manifest`] Tell the client which one they can do; they usually cannot change the SDK's repository.
* **A file that differs only in case** (`package.swift`, `Package.Swift`): SwiftPM reads the manifest out of git's tree, where names are case-sensitive, so even on a case-insensitive Mac it is "not found". [verified: manifest-case-lower, manifest-case-mixed] Only the owner can fix it, with a new tag. The rename must be recorded by git: on a case-insensitive disk `mv package.swift Package.swift` followed by `git add -A` changed nothing; git kept tracking `package.swift`. Use `git mv` through a temporary name. [verified: manifest-case-lower observation and fix]
* **The same wrong case in a local path dependency does not fail on the Mac**: `swift package resolve` succeeded on the default (case-insensitive) volume and failed on a case-sensitive APFS volume with `the package manifest at '.../Package.swift' cannot be accessed`. So "works on my Mac, fails on the Linux CI runner" is a real pattern. [verified: manifest-case-local-path; Linux itself was not used, a case-sensitive APFS disk image stood in]
* **Only `Package@swift-9.0.swift` and no `Package.swift`**: SwiftPM ignores a version-specific manifest whose version is newer than the toolchain, so nothing is left. Same message as a missing file. [verified: future-version-manifest] The fix is a generic `Package.swift` next to it. With both present the newer file is ignored and resolution works. [verified: future-version-manifest, fix]
* **The newest tag has no manifest but older tags do**: SwiftPM does not fall back to an older tag. It picks the highest tag in range and fails. [verified: tag-missing-manifest] Client-side workaround: cap the range below the bad release, `.upToNextMinor(from: "1.0.0")`. [verified, `client_stay_below`] Proper fix: the owner publishes a new tag whose commit has the manifest; moving the old tag would break every machine that cached the old commit (step 4). [verified, `owner_new_tag`]
* **Tags exist but none is `x.y.z`** (`v1`, `release-1.0`, `CocoaPods-1.0.0`): `no versions of ... match`. Pin by `revision:` as a stopgap, or ask the owner for a real semver tag. [verified: no-matching-tag]
* **The branch no longer exists** (`master` renamed to `main`): `could not find a branch named ‘master’ (did you mean ‘main’?)`. The developer machine kept working, because its existing checkout and `Package.resolved` still satisfied the pin; only a fresh checkout failed. Switch to `branch: "main"`, or better to a version tag. [verified: branch-deleted]

## 3. Is the URL right?

* `Failed to clone repository ...: fatal: repository ... does not exist` means nothing is at that URL. Typo (open the URL in a browser; a real repository page exists) or the repository moved. [verified: url-typo, repo-moved]
* A typo in the **last path component** is caught earlier, as `unknown package 'AcmeKit' in dependencies of target ...; valid packages are: 'AcmeKitt'`, because the package identity comes from that component and no longer matches the `.product(name:package:)` line. It never reaches the network. [verified: url-typo-package-name]
* A moved repository: update the URL in `Package.swift` or in Xcode's package list, [verified: repo-moved, `client_update_url`] or, if you cannot edit the manifest that names it (it is a dependency of a dependency), redirect it with a mirror: `swift package config set-mirror --original <old> --mirror <new>`. [verified: repo-moved, `client_set_mirror`; with `file://` fixtures SwiftPM only matched the path form of the URL, with real `https` URLs use the https URL (knowledge only)] GitHub redirects renamed repositories on its own. That is why most "moved" cases on GitHub work; a deleted or private one does not. [knowledge only]

## 4. Package.resolved

* The file pins a **revision**, not a tag. If the owner moved a tag or force-pushed a branch and deleted the old commit, the pin points at nothing. [verified: pinned-revision-gone-tag, pinned-revision-gone-branch]
* In the plain mode SwiftPM **silently re-pins** a tagged dependency when the pinned commit is gone, and rewrites `Package.resolved` (exit 0). With the lock-file mode CI uses (`--force-resolved-versions`; Xcode: `-onlyUsePackageVersionsFromResolvedFile`) the same state fails with `Couldn’t check out revision`. A pin on a **branch** failed already in the plain mode (`could not find the commit`). So a green local build does not prove the pin is valid. [verified: pinned-revision-gone-tag observation; pinned-revision-gone-branch. In an exploratory run the branch pin also failed in lock-file mode, worded as `Couldn’t check out revision`; that run is not a scenario]
* Fix: re-pin on purpose, then commit the new `Package.resolved`: `swift package update <package>`, [verified, `package_update` in both scenarios] or delete `Package.resolved` and resolve once. [verified, `regenerate_resolved`] In lock-file mode, **deleting `Package.resolved` is not a fix**: SwiftPM answers `a resolved file is required when automatic dependency resolution is disabled`. [verified: pinned-revision-gone-tag, wrong fix `delete_resolved`]
* Deleting `Package.resolved` does **not** help when the cause is a missing manifest, a URL, or a tools version. [verified: refused in tag-missing-manifest, monorepo-subdir, manifest-case-lower, future-version-manifest, repo-moved, url-typo, tools-version-too-new-range]
* Ask the owner not to move tags. Publish a new patch tag instead. [knowledge only]

## 5. Tools version

* `// swift-tools-version: X` in the **dependency's** `Package.swift` must be at most the installed Swift. `xcodebuild -version` / `swift --version` give the installed one. [verified: tools-version-too-new-range, tools-version-too-new-branch]
* With a version requirement SwiftPM skips releases that are too new and takes an older one in range, silently; it fails only when **no** release in range is compatible, and says `contains incompatible tools version`. [verified: tools-version-too-new-range observation (`from: "0.9.0"` resolved 0.9.0, skipping 1.0.0)] With a branch or revision requirement there is nothing to skip: `package 'acmekit' @ <sha> is using Swift tools version 99.0.0 but the installed version is 6.4.2`. [verified: tools-version-too-new-branch]
* Fix: update Xcode (not possible in the lab; [knowledge only]), pin an older release the installed Xcode supports (`exact:`), [verified: tools-version-too-new-range, `client_pin_older_release`] a branch whose manifest is old enough, [verified: tools-version-too-new-branch, `client_branch_legacy`] or ask the owner to lower the tools version. [verified, `owner_lower_tools_version`]
* Raising the **consumer's** own `swift-tools-version` does nothing. [verified: refused in tag-missing-manifest, tools-version-too-new-range and others]

## 6. Reset safely, from least to most destructive

Do these only after steps 2 to 5 did not explain the message, or when the message names an unreadable git object (`Couldn’t read ‘<sha>’`, `unable to read tree`, `Not a valid object name`). Order matters: stop at the first one that works, and write down which one it was.

1. **Resolve again** (Xcode: File > Packages > Resolve Package Versions; CLI: `swift package resolve`). [not run: Xcode UI] Cheap and sometimes enough after a transient network error. [knowledge only]
2. **Reset the project's checkouts** (`swift package reset`; deleting `DerivedData/<project>-*/SourcePackages` is the manual form). Do it **together with step 3**, not instead of it: in both cache scenarios `reset` alone and deleting the scratch directory (the stand-in for deleting `.build` or DerivedData) left the error in place, because the damage lives in the shared cache. [verified: refused wrong fixes `reset_only` and `delete_scratch` in cache-missing-manifest-blob and cache-missing-tree]
3. **Purge the shared cache** (`swift package purge-cache`; Xcode: File > Packages > Reset Package Caches, [not run: Xcode UI]). Also not enough alone: the failed attempt had already copied the damaged clone into the project's own scratch directory, so `purge-cache` alone was refused as well. **Purge the cache and reset the project together** (`swift package purge-cache` then `swift package reset`) and both cache scenarios resolved and built; so did deleting just the damaged clone under the cache's `repositories/` plus the scratch directory. [verified: cache-missing-manifest-blob and cache-missing-tree, fixes `purge_cache_and_reset` and `remove_clone_and_scratch`; refused wrong fix `purge_cache_only`] The purge affects every project that shares the cache (on this Mac `~/Library/Caches/org.swift.swiftpm`, which the lab never touched), so tell the client before doing it on their machine.
4. **Re-resolve and re-pin** (File > Packages > Update to Latest Package Versions; CLI `swift package update`). [not run: Xcode UI] This changes versions. It is **not** a repair for a missing manifest, a typo or an incompatible tools version: refused in every scenario it was tried. [verified: `update` in tag-missing-manifest, tools-version-too-new-range, url-typo, repo-moved, no-matching-tag and others]
5. Last resort: delete `DerivedData` and the cache together, and `Package.resolved`. In the lab, "delete scratch, cache and Package.resolved" fixed **nothing** in the missing-manifest and URL scenarios. [verified: `delete_everything` refused in tag-missing-manifest, manifest-case-lower, future-version-manifest, url-typo] It was not tried on the two cache scenarios, where the narrower pair in steps 2 and 3 was tested and works.

A damaged shared cache usually degrades quietly: for most kinds of damage SwiftPM printed `warning: skipping cache due to an error` and re-cloned from the server. It failed only when the damage was in an object the clone still advertised (a missing blob or tree). Without network access the same damage cannot self-heal. [verified in exploratory runs: delete HEAD, delete refs, delete objects, byte-flipped pack all self-healed with a warning; they are not scenarios because they end in success. The lab keeps the two that fail.]

## 7. What to send the client

A short message, in this order:

1. The **exact** first error line, copied, and the dependency URL from the line above it.
2. What it means in one sentence (for example "tag 1.1.0 of that repository has no Package.swift, so no tool can build it").
3. What you checked on the host and what you saw: tag, branch, the file listing (step 2). A screenshot of the host's tag page helps.
4. Whose repository it is. If it is a third party's, say that the permanent fix is theirs and give the client the choice between the stopgap you tested (pin, path dependency, mirror) and waiting.
5. What you changed in their project, as a diff, and the command that proves it: `swift package resolve` and `swift build` green on a fresh checkout. If you used Xcode only, say so: this lab's results are from the SwiftPM command line.
6. What you did **not** do: you did not reset the shared cache without telling them, you did not move tags, you did not ask for repository credentials.

Never ask for tokens or passwords in chat. For private repositories ask the client to add an access method they control (SSH key or a read-only deploy token). [knowledge only]

## Not covered by the lab

* Xcode's UI and its exact wording, and `xcodebuild -resolvePackageDependencies`: not run.
* Binary targets (xcframework checksum mismatch, `downloaded archive` errors): not reproduced. [knowledge only]
* Private repositories, authentication, SSH, corporate proxies, rate limiting: not reproduced. The fixtures were local and anonymous.
* CocoaPods and Carthage: out of scope.
* Git submodule problems inside a dependency (`Couldn't update repository submodules`): not reproduced.
