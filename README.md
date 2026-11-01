# mobile-kit

> **Status:** a proof project in two separate parts. **The app and its tests:** 197 tests pass locally on Node v25.2.1 on macOS (162 in Jest with `jest-expo`, 35 in `node:test`), typecheck clean. The app side ran in plain Node: it was **never run on an iOS Simulator, an Android emulator or a physical phone, and Expo Go was never opened.** The one thing beyond tests: `expo export` bundled the app for iOS and Android with Metro (no Xcode, no Android SDK involved). **The Swift Package Manager recovery lab** (`swift-spm-lab/`): the only Swift/iOS-toolchain work in this repository. It reproduces failures such as "Package.swift doesn't exist" with local git fixtures, using `swift package`, `swift build` and `swift test` from Xcode 27.2 (Swift 6.4.2) on macOS, and checks a fix and several wrong fixes for each. It is host-only: **no simulator, no device, no Xcode UI, no `xcodebuild`, no client project**, and it is not part of CI. Details and limits are in [`swift-spm-lab/README.md`](swift-spm-lab/README.md). Not used for any client, no production use. See Limits below.

A tested starting point for the usual mobile jobs: "fix my React Native / Expo app that loads data from an API", "the app shows a blank screen", "add loading, error and empty states", "write tests for my mobile app".

It is a small fictional **Field Service Jobs** app (a job list and a job detail screen) with the API-screen basics done carefully, a mock API that can fail on demand, and tests that run on a laptop without a phone.

| Piece | Where | What it does |
|---|---|---|
| API client | `app/src/api/client.ts` | `fetch` with a per-attempt timeout, abort on unmount/refresh, retry with exponential backoff and jitter on 5xx, 429, timeouts and network errors (never on other 4xx or a bad payload), `Retry-After` honoured, typed `ApiError` kinds |
| Validation | `app/src/api/validate.ts` | Hand-written checks of every payload. A truncated body, an HTML page, or the wrong shape becomes an error state, not a crash |
| Config | `app/src/api/config.ts` | Base URL from `EXPO_PUBLIC_API_BASE_URL` or `expo.extra.apiBaseUrl`; refuses a URL with embedded credentials; a readable "not configured" screen instead of a red box |
| List screen | `app/src/screens/JobListScreen.tsx`, `app/src/state/useJobList.ts` | Loading, empty, error with Retry, stale-list banner ("you may be offline"), pull to refresh, infinite scroll with a footer spinner and a footer Retry, cancel on unmount and on refresh |
| Detail screen | `app/src/screens/JobDetailScreen.tsx`, `app/src/state/useJob.ts` | Uses the cached job or fetches it (a link straight to a job), own loading/error/404 states |
| Optimistic write | `app/src/state/JobsCache.tsx` | "Mark as done" shows at once, rolls back to the exact previous job if the server fails, tells the user, survives a refresh that lands mid-write |
| Mock API | `mock-api/` | Dependency-free `node:http` server, 23 fictional jobs, failure modes `slow`, `error500`, `rate-limit` (429 + `Retry-After`), `malformed-json`, `empty`, `wrong-schema`, switchable per request kind and for N requests |
| Mutation check | `scripts/mutation-check.mjs` | Breaks the client, validation, state and screens in 59 single-line ways, one at a time, on a throwaway copy |
| Debug checklist | `docs/RN-DEBUG-CHECKLIST.md` | What to ask a client and what to check first, each item tagged verified here or knowledge only |
| Swift Package Manager recovery lab | `swift-spm-lab/` | 17 deliberately broken Swift package situations (missing or misnamed `Package.swift`, monorepo path, stale `Package.resolved`, deleted branch, tools-version too new, damaged cache, moved repository, ...) with the real tool output, a verified fix and refused wrong fixes for each, plus an ordered [recovery checklist](swift-spm-lab/docs/RECOVERY-CHECKLIST.md) |

**Routing choice:** expo-router, because it is the Expo default (file-based routes under `app/src/app`), pulls in the navigation stack without extra wiring, and ships a testing helper (`renderRouter`) that lets the tests render the real layout and routes.

**Test runner choice:** Jest with `jest-expo` and `@testing-library/react-native`. It is the supported path for Expo, and it worked here, so Vitest was not needed.

## Exact versions

| | |
|---|---|
| Node / npm | v25.2.1 / 11.6.2 (macOS 27.2, arm64) |
| Expo SDK | 58 (`expo` 58.0.22, current stable on the date of the build) |
| `react-native` / `react` / `react-dom` | 0.88.1 / 19.3.0 / 19.3.0 (`react-dom` is declared only because `npm ci` fails without it: expo-router's dependencies have it as a peer, and the first fresh clone caught this) |
| `expo-router` | 58.0.29 |
| `react-native-screens` / `react-native-safe-area-context` | 4.30.1 / 5.10.1 |
| `expo-constants` / `expo-linking` / `expo-status-bar` | 58.0.14 / 58.0.15 / 58.0.4 |
| `jest` / `jest-expo` | 30.5.2 / 58.0.13 |
| `@testing-library/react-native` | 14.1.0 (async API: `await render`, `await fireEvent`) |
| `typescript` | 6.0.3 in `app/` (what the Expo template uses), 7.0.2 in the repo root (for `mock-api/`) |

`app/__tests__/sdk-versions.test.ts` checks that every package the SDK pins is declared at exactly the version in `node_modules/expo/bundledNativeModules.json`. `npx expo install --check` itself was not run (see Limits).

## Quickstart

Two installs, because `app/` is a self-contained Expo project:

```bash
npm ci                    # root: typescript and @types/node for mock-api
npm ci --prefix app       # the Expo app and its test tooling

npm run typecheck         # tsc for mock-api, then tsc for the app
npm test                  # node:test for mock-api (35), then Jest for the app (162)
npm run test:app          # just the Jest part
npm run mutation-check    # about 6 minutes; exits 1 if any mutant survives, times out or is invalid
```

Run the mock API (a second terminal is needed to use it with an app):

```bash
npm run mock-api                                   # http://127.0.0.1:4010, mode normal
npm run mock-api -- --mode error500 --times 2      # the first 2 data requests fail with 500, then it recovers
npm run mock-api -- --mode rate-limit --retry-after 3 --scope read
npm run mock-api -- --host 0.0.0.0                 # reachable from a phone on the same network (no authentication on /__admin)
```

Switch modes while it runs:

```bash
curl -X POST localhost:4010/__admin/mode -d '{"mode":"slow","delayMs":4000}'
curl -X POST localhost:4010/__admin/mode -d '{"mode":"malformed-json","times":1}'
curl -X POST localhost:4010/__admin/mode -d '{"mode":"error500","scope":"write"}'   # only mark-done fails
curl -X POST localhost:4010/__admin/reset
curl localhost:4010/__admin/state
```

Modes: `normal`, `slow`, `error500`, `rate-limit`, `malformed-json`, `empty`, `wrong-schema`. Scopes: `all`, `read` (GET), `write` (PATCH). `times` limits how many requests are affected before it returns to normal.

Starting the app (**never done here**): `cd app && EXPO_PUBLIC_API_BASE_URL=http://<address the device can reach>:4010 npx expo start`. See the debug checklist for which address that is on a simulator, an emulator and a phone.

## What this proves, and what it does not

| Claim | Proved by | Proves it? |
|---|---|---|
| The client retries 5xx, 429, timeouts and network errors, and does not retry other 4xx or bad payloads | `client.test.ts` (fake fetch), `client-integration.test.ts` (real sockets, real `fetch`, the mock API) | Yes, in Node |
| Backoff doubles, is capped, jittered, and `Retry-After` is honoured (and not waited out when too long) | `client.test.ts` | Yes, with injected sleep and random |
| A request is cancelled when its screen is left or a refresh starts, and a late answer is ignored | `list-screen.test.tsx`, `detail-screen.test.tsx`, `client.test.ts` | Yes, for this app's code. Not for the native network layer |
| A malformed, truncated or wrong-shaped payload shows an error state and never crashes | `validate.test.ts`, `list-screen.test.tsx`, mock API modes in `client-integration.test.ts` | Yes |
| Loading, empty, error, stale-list, load-more-error states look right and have labels | `list-screen.test.tsx`, `detail-screen.test.tsx` | The **logic and the accessibility props**. Not how it looks |
| Optimistic write applies at once, rolls back exactly, and survives a refresh | `jobs-cache.test.tsx`, `detail-screen.test.tsx` | Yes, in the test renderer |
| No secret ships in the bundle | `config.test.ts` (no credentials in URL, `extra` holds only `apiBaseUrl`), bundle check below | Partly: this project has no secrets to leak; the check shows the mechanism |
| Swift Package Manager failures can be reproduced, fixed, and wrong fixes refused | `swift-spm-lab/verify.sh` | Yes for `swift package`/`swift build`/`swift test` on macOS with local git fixtures. **No** for Xcode's UI, real client projects, binary targets or CocoaPods (see `swift-spm-lab/README.md`) |
| It runs on iOS | nothing | **No** |
| It runs on Android | nothing | **No** |
| It looks and scrolls correctly | nothing | **No** (the test renderer has no layout pass; `FlatList` renders only its first rows, so long-list tests read the data the screen hands to the list) |
| Performance, memory, battery, startup time | nothing | **No** |
| Real-device networking (LAN IP, cleartext, ATS, certificates) | `docs/RN-DEBUG-CHECKLIST.md` | **No**; the checklist says which parts are knowledge only |

## Bundle check

Run once, by hand (not part of `npm test`): `EXPO_OFFLINE=1 EXPO_PUBLIC_API_BASE_URL=http://192.168.50.20:4010 npx expo export --platform ios --platform android` inside `app/`. Metro bundled both platforms (1169 modules for iOS, 1163 for Android) and produced Hermes bytecode, 2.5 MB each. Searching the two bundles with `strings`: the given URL appears once in each, and none of `sk_live`, `sk_test`, `secret_key`, `api_key`, `bearer ` appears. The variable name `EXPO_PUBLIC_API_BASE_URL` is also in the bundle, inside this project's own error message. This shows the base URL is public by design (anything in `EXPO_PUBLIC_*` or `expo.extra` can be read from the app), which is why `resolveBaseUrl` refuses a URL with credentials. It does not show that the bundle runs.

## Mutation check

`npm run mutation-check` copies the project, applies **one** single-line breakage at a time (retry every 4xx, drop the Retry-After wait, never clear the timer, skip the date check, show the empty state instead of the error, keep the optimistic value after a failure, let a refresh overwrite a pending write, and so on), then runs the typecheck, the Jest suite and the Node suite. The real tree is never touched. Each mutant has a hard time limit (default 150 s, `--timeout`) covering all of its steps; at the limit the whole process tree (Jest workers included) is killed with SIGKILL and the result is **TIMEOUT, which counts as not killed** and fails the run. `-- --self-test` starts a process with a hung grandchild and shows the tree is killed (about 3 s). `-- --validate` checks that every mutant still applies to the current source. Results, per mutant, from the last run: `docs/MUTATION-CHECK.md`. `-- --list` shows all 59.

Last run: 59 mutants, 59 killed, 0 survived, 0 timeouts, 0 invalid (`docs/MUTATION-CHECK.md`).

The mutation check shows that these 59 chosen breakages are detected, not that the tests catch every possible bug. The first full run found one survivor (the stale-data banner staying visible while a new refresh runs) and eleven mutants that did not compile (an unused variable or a type error is rejected by the typecheck, so they never reached the tests); the survivor's test was tightened and the invalid mutants were rewritten so they compile.

## Common mistakes in "loads data from an API" screens, and what this does

| Mistake | What the kit does | Test |
|---|---|---|
| `setLoading(false)` only on success, so the spinner never ends | Every path ends in `ready`, `error` or an abort that is ignored on purpose | `list-screen.test.tsx` "error" group |
| No timeout, so a half-open connection hangs forever | 8 s per attempt (configurable), body read included | `client.test.ts`, `client-integration.test.ts` (100 ms limit against `slow` mode) |
| `data.items.map` on a payload that is not what was expected | Validation turns it into an error state | `validate.test.ts`, `list-screen.test.tsx` |
| State update after leaving the screen, or an old request overwriting a new one | Abort plus a generation counter | "pull to refresh", "leaving the screen" |
| Retrying everything, including 400/401/404 | Retry only 5xx, 429, timeout, network | `client.test.ts` |
| Hammering a failing server by scrolling | After a failed page, only the Retry button loads again | "pagination" group |
| Same job in the list twice after paging | De-duplicated by id | "a job that appears on two pages is shown once" |
| Optimistic update that sticks after a failure | Exact rollback plus a visible message | `jobs-cache.test.tsx`, `detail-screen.test.tsx` |
| A pull-to-refresh that undoes a pending write | Pending jobs are skipped by `upsertMany` | `jobs-cache.test.tsx`, `detail-screen.test.tsx` |
| Server error text shown to the user | Fixed wording per error kind, server text never copied | `client.test.ts`, `list-screen.test.tsx` |

## Limits

* **Never run on a device, simulator or emulator, and Expo Go was never opened.** Everything is verified in Node with Jest's React Native test renderer. Layout, gestures, scrolling, keyboard, safe areas, fonts, dark mode, dynamic type, screen readers and real `fetch` behaviour of Hermes are unverified. The one build-like step is `expo export` (Metro and Hermes bytecode for both platforms); the resulting bundles were never executed.
* **Swift/iOS native work is limited to `swift-spm-lab/`**, which runs Swift Package Manager on the macOS host with local git repositories. There is no Xcode project, no signing, no iOS build or simulator run, no `xcodebuild`, and the lab was not driven through Xcode's UI or run on a client project. It shows the method and the tested commands, not that a particular client's iOS build will work.
* **Platform differences are untested:** platform-specific layout, `Platform.OS` branches (there are none), iOS vs Android back behaviour, status bar, and anything the OS does differently.
* **No native modules** beyond what Expo SDK 58 brings (`react-native-screens`, `react-native-safe-area-context`, `expo-constants`, `expo-linking`, `expo-status-bar`). No device connectivity API (NetInfo): "offline-ish" means a request failed with a network error or timed out, not that the OS reported no connection.
* **No push notifications, no auth** (the API is open; there is no token handling, no refresh, no secure storage), **no app store builds, no EAS, no signing, no OTA updates**, no deep-link configuration beyond the default scheme.
* **No device-specific bugs** (low memory, background/foreground, rotation: the app is locked to portrait in `app.json`, which is also untested).
* **The retry of the write is a design choice:** setting a status to a value is idempotent, so `setJobStatus` is retried like a read. A non-idempotent write (create an order) must not be retried without an idempotency key; this kit has none of those.
* **Validation is strict on purpose:** one bad item or one unknown `status` value rejects the whole page. That is the safe default for a fixed contract; for a server that adds enum values often, map unknown values instead.
* **Times are shown in UTC** (`2026-06-01 08:00 UTC`) so the screens and tests do not depend on the device locale. A real field-service app would show local time.
* **Cache and state are in memory only.** Nothing is persisted, so a restart starts from an empty list, and the list is not kept offline.
* **Test setup shortcuts:** long lists are asserted through the `data` handed to `FlatList`, because the test renderer renders only the first rows; pull to refresh and end-reached are triggered by calling the props (`refreshControl.props.onRefresh`, `onEndReached`), not by a gesture; `console.error` and `console.warn` fail any test (`app/jest.setup.ts`).
* **`npx expo install --check` and `expo-doctor` were not run:** the first attempt crashed because the Mac's system Node was broken by a Homebrew library update during the build, so a private copy of the same Node v25.2.1 binary was used for every command. The version table is checked by a test instead.
* **The Swift lab is not in CI.** `swift-spm-lab/` needs macOS with Xcode; no macOS job was added and nothing of it has run on GitHub Actions (a note in `ci.yml` says so).
* **CI cannot run here.** `.github/workflows/ci.yml` (`npm ci`, `npm ci --prefix app`, typecheck, tests, mutation `--validate` and `--self-test`) has never executed on GitHub. Tested on Node v25.2.1 and macOS only; the full mutation check is not part of CI because it takes minutes.
* **Not covered:** accessibility audits with real assistive tech, security review, load, and the mock API as a model of any real service (it is a test double with fictional data).

## Layout

```
app/                      Expo project (own package.json and lockfile)
  src/app/                expo-router routes: _layout.tsx, index.tsx, jobs/[id].tsx
  src/api/                client, validation, config, error kinds, provider
  src/state/              JobsCache (optimistic write), useJobList, useJob
  src/screens/            JobListScreen, JobDetailScreen, ConfigErrorScreen
  src/components/         StateView, Banner, JobRow, formatting, theme
  __tests__/              Jest suites (+ helpers/: fake fetch, fake client, router rendering)
mock-api/                 server.ts, start.ts, test/ (node:test, including the client-vs-mock-api test)
scripts/mutation-check.mjs
swift-spm-lab/            Swift Package Manager recovery lab (own README; verify.sh, scenarios/, docs/)
docs/                     RN-DEBUG-CHECKLIST.md, MUTATION-CHECK.md
```

MIT licensed. All data in the mock API, fixtures and tests is fictional.
