# Results of the last full verify run

Written by `./verify.sh` (see the README for what it does and does not prove).

* Date: 2026-11-01
* Toolchain: Apple Swift version 6.4.2 (swiftlang-6.4.2.1.9 clang-2100.4.1.1)
* macOS: 27.2 (arm64)
* scenarios: 18 | fixes verified (resolve + build): 28/28 | wrong fixes refused: 63/63
* Real SwiftPM/Xcode locations before vs after the run: unchanged
* Stray mounts: 0, stray git daemons: 0

| # | scenario | resolve | Package.swift in message | first line of the real error (trimmed) | fixes verified | wrong fixes refused | docs/errors |
|---|---|---|---|---|---|---|---|
| 00 | baseline | exit 0 | no | control: resolve, build and swift test all succeed | 0/0 | 0/0 | same |
| 01 | tag-missing-manifest | exit 1 | yes | error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in... | 2/2 | 4/4 | same |
| 02 | monorepo-subdir | exit 1 | yes | error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in... | 2/2 | 4/4 | same |
| 03 | manifest-case-lower | exit 1 | yes | error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in... | 1/1 | 4/4 | same |
| 04 | manifest-case-mixed | exit 1 | yes | error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in... | 1/1 | 3/3 | same |
| 05 | manifest-case-local-path | exit 1 | yes | error: the package manifest at '<LAB>/.work/scenarios/manifest-case-local-path/csvol/fixtures/AcmeK... | 1/1 | 3/3 | same |
| 06 | future-version-manifest | exit 1 | yes | error: the package manifest at '/Package.swift' cannot be accessed (/Package.swift doesn't exist in... | 1/1 | 4/4 | same |
| 07 | pinned-revision-gone-tag | exit 1 | no | error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f5463ea0ee5’: | 2/2 | 3/3 | same |
| 08 | pinned-revision-gone-branch | exit 1 | no | error: could not find the commit 70c96522a51a603f0527f71055d90cfdf3a45c99 in <LAB>/.work/scenarios/... | 2/2 | 3/3 | same |
| 09 | branch-deleted | exit 1 | no | error: could not find a branch named ‘master’ in <LAB>/.work/scenarios/branch-deleted/fixtures/Acme... | 2/2 | 3/3 | same |
| 10 | tools-version-too-new-range | exit 1 | no | error: Dependencies could not be resolved because root depends on 'acmekit' 1.0.0..<2.0.0. | 2/2 | 4/4 | same |
| 11 | tools-version-too-new-branch | exit 1 | no | error: package 'acmekit' @ 32201263a9986404b5ac13c01add31f6425fc2bb is using Swift tools version 99... | 3/3 | 4/4 | same |
| 12 | cache-missing-manifest-blob | exit 1 | yes | error: the package manifest at '/Package.swift' cannot be accessed (Couldn’t read ‘a0a930563604b18e... | 2/2 | 5/5 | same |
| 13 | cache-missing-tree | exit 1 | no | error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f5463ea0ee5’: | 1/1 | 4/4 | same |
| 14 | url-typo | exit 1 | no | error: Failed to clone repository <LAB>/.work/scenarios/url-typo/fixtures/acme-cp/AcmeKit: | 1/1 | 4/4 | same |
| 15 | url-typo-package-name | exit 1 | no | error: 'consumer': unknown package 'AcmeKit' in dependencies of target 'LabKit'; valid packages are... | 1/1 | 3/3 | same |
| 16 | repo-moved | exit 1 | no | error: Failed to clone repository <LAB>/.work/scenarios/repo-moved/fixtures/old/AcmeKit: | 2/2 | 4/4 | same |
| 17 | no-matching-tag | exit 1 | no | error: Dependencies could not be resolved because no versions of 'acmekit' match the requirement 1.... | 2/2 | 4/4 | same |

A wrong fix is **refused** when `swift package resolve` still fails after it. "same error" means the original message is still there; "different error" means resolve fails for another reason (for example the lock-file mode refuses a missing Package.resolved).

| scenario | wrong fix | result |
|---|---|---|
| tag-missing-manifest | delete_resolved | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| tag-missing-manifest | delete_everything | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| tag-missing-manifest | bump_consumer_tools | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| tag-missing-manifest | update | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| monorepo-subdir | delete_resolved | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| monorepo-subdir | bump_consumer_tools | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| monorepo-subdir | branch_main | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| monorepo-subdir | exact_version | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-lower | delete_resolved | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-lower | delete_everything | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-lower | bump_consumer_tools | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-lower | update | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-mixed | delete_resolved | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-mixed | purge_cache | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-mixed | bump_consumer_tools | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| manifest-case-local-path | delete_resolved | REFUSED: same error: error: the package manifest at '<LAB>/.work/scenarios/manifest-case-local-pat... |
| manifest-case-local-path | purge_cache | REFUSED: same error: error: the package manifest at '<LAB>/.work/scenarios/manifest-case-local-pat... |
| manifest-case-local-path | bump_consumer_tools | REFUSED: same error: error: the package manifest at '<LAB>/.work/scenarios/manifest-case-local-pat... |
| future-version-manifest | delete_resolved | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| future-version-manifest | delete_everything | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| future-version-manifest | bump_consumer_tools | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| future-version-manifest | update | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (/Package.... |
| pinned-revision-gone-tag | delete_resolved | REFUSED: different error: error: a resolved file is required when automatic dependency resolution ... |
| pinned-revision-gone-tag | purge_cache | REFUSED: same error: error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f... |
| pinned-revision-gone-tag | bump_consumer_tools | REFUSED: same error: error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f... |
| pinned-revision-gone-branch | delete_scratch | REFUSED: same error: error: could not find the commit 70c96522a51a603f0527f71055d90cfdf3a45c99 in ... |
| pinned-revision-gone-branch | purge_cache | REFUSED: same error: error: could not find the commit 70c96522a51a603f0527f71055d90cfdf3a45c99 in ... |
| pinned-revision-gone-branch | bump_consumer_tools | REFUSED: same error: error: could not find the commit 70c96522a51a603f0527f71055d90cfdf3a45c99 in ... |
| branch-deleted | purge_cache | REFUSED: same error: error: could not find a branch named ‘master’ in <LAB>/.work/scenarios/branch... |
| branch-deleted | update | REFUSED: same error: error: could not find a branch named ‘master’ in <LAB>/.work/scenarios/branch... |
| branch-deleted | bump_consumer_tools | REFUSED: same error: error: could not find a branch named ‘master’ in <LAB>/.work/scenarios/branch... |
| tools-version-too-new-range | bump_consumer_tools | REFUSED: same error: error: Dependencies could not be resolved because root depends on 'acmekit' 1... |
| tools-version-too-new-range | delete_resolved | REFUSED: same error: error: Dependencies could not be resolved because root depends on 'acmekit' 1... |
| tools-version-too-new-range | update | REFUSED: same error: error: Dependencies could not be resolved because root depends on 'acmekit' 1... |
| tools-version-too-new-range | purge_cache | REFUSED: same error: error: Dependencies could not be resolved because root depends on 'acmekit' 1... |
| tools-version-too-new-branch | bump_consumer_tools | REFUSED: same error: error: package 'acmekit' @ 32201263a9986404b5ac13c01add31f6425fc2bb is using ... |
| tools-version-too-new-branch | delete_resolved | REFUSED: same error: error: package 'acmekit' @ 32201263a9986404b5ac13c01add31f6425fc2bb is using ... |
| tools-version-too-new-branch | update | REFUSED: same error: error: package 'acmekit' @ 32201263a9986404b5ac13c01add31f6425fc2bb is using ... |
| tools-version-too-new-branch | purge_cache | REFUSED: same error: error: package 'acmekit' @ 32201263a9986404b5ac13c01add31f6425fc2bb is using ... |
| cache-missing-manifest-blob | delete_scratch | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (Couldn’t ... |
| cache-missing-manifest-blob | purge_cache_only | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (Couldn’t ... |
| cache-missing-manifest-blob | reset_only | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (Couldn’t ... |
| cache-missing-manifest-blob | delete_resolved | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (Couldn’t ... |
| cache-missing-manifest-blob | bump_consumer_tools | REFUSED: same error: error: the package manifest at '/Package.swift' cannot be accessed (Couldn’t ... |
| cache-missing-tree | delete_scratch | REFUSED: same error: error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f... |
| cache-missing-tree | purge_cache_only | REFUSED: same error: error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f... |
| cache-missing-tree | reset_only | REFUSED: same error: error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f... |
| cache-missing-tree | delete_resolved | REFUSED: same error: error: 'acmekit': Couldn’t check out revision ‘61bed31b6ade578c818218503c4d0f... |
| url-typo | delete_resolved | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/url-typo/fixtures/acm... |
| url-typo | purge_cache | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/url-typo/fixtures/acm... |
| url-typo | update | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/url-typo/fixtures/acm... |
| url-typo | delete_everything | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/url-typo/fixtures/acm... |
| url-typo-package-name | delete_resolved | REFUSED: same error: error: 'consumer': unknown package 'AcmeKit' in dependencies of target 'LabKi... |
| url-typo-package-name | purge_cache | REFUSED: same error: error: 'consumer': unknown package 'AcmeKit' in dependencies of target 'LabKi... |
| url-typo-package-name | update | REFUSED: same error: error: 'consumer': unknown package 'AcmeKit' in dependencies of target 'LabKi... |
| repo-moved | delete_resolved | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/repo-moved/fixtures/o... |
| repo-moved | purge_cache | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/repo-moved/fixtures/o... |
| repo-moved | delete_scratch | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/repo-moved/fixtures/o... |
| repo-moved | update | REFUSED: same error: error: Failed to clone repository <LAB>/.work/scenarios/repo-moved/fixtures/o... |
| no-matching-tag | delete_resolved | REFUSED: same error: error: Dependencies could not be resolved because no versions of 'acmekit' ma... |
| no-matching-tag | purge_cache | REFUSED: same error: error: Dependencies could not be resolved because no versions of 'acmekit' ma... |
| no-matching-tag | update | REFUSED: same error: error: Dependencies could not be resolved because no versions of 'acmekit' ma... |
| no-matching-tag | lower_requirement | REFUSED: same error: error: Dependencies could not be resolved because no versions of 'acmekit' ma... |
