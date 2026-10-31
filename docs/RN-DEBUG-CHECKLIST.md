# React Native / Expo debug checklist

Written for the jobs that start with "my app shows a blank screen", "it works in the browser but not on the phone", "it is stuck on a spinner". Every item is tagged:

* **[verified here]** I ran something on a laptop that shows it, and the line says what. This project never ran on a phone, a simulator, an emulator or Expo Go, so nothing below was seen on a device.
* **[knowledge only]** I know it from documentation and general experience. I did not reproduce it. Treat it as a strong hint, not as a finding.

## First, ask the client

1. **Where does it fail?** iOS, Android, both, or only web? A real phone, a simulator or an emulator? Expo Go, a development build, or a store build? [knowledge only]
2. **What exactly is "blank"?** A white screen, a red error screen, a yellow warning, an app that closes, or a screen with a spinner that never ends? They have different causes (sections below). [knowledge only]
3. **Exact versions:** `npx expo --version`, the `expo`, `react-native` and `react` lines of `package.json`, the Expo Go version if used, Node version, whether `package-lock.json` or `yarn.lock` is committed. [knowledge only]
4. **What changed last?** A new package, an SDK upgrade, a changed API URL, a new backend deploy. "It worked yesterday" is the most useful sentence in a bug report. [knowledge only]
5. **The API:** its base URL, whether it is `http` or `https`, whether it runs on the client's laptop or on a server, and one `curl` of the failing request with the status and the body. [knowledge only]
6. **The log:** the full Metro terminal output from start to the failure, plus the red-box text and stack if there is one. A screenshot of a red box is not enough: ask for the text. [knowledge only]
7. **Can I reproduce it?** A repo or a zip without `node_modules`, the exact command they run, and which device. Never ask for production keys; ask for a test environment. [knowledge only]

## Blank (white) screen

Check in this order:

1. **Is the JavaScript running at all?** Look at the Metro terminal. If it shows no "Bundled" line when the app opens, the app never loaded the bundle (wrong network, Metro not running, tunnel down). If it did bundle, the app started and crashed or rendered nothing. [knowledge only]
2. **Is there a red box or a console error?** An error thrown during the first render with no error boundary leaves a blank screen in a production build. In development it is a red box. [knowledge only]
3. **Does the screen render `undefined` data?** The classic: `data.items.map(...)` when the API answered with something else, so the first render throws. This project's client validates the payload and shows an error state instead. **[verified here]**: a truncated JSON body, an HTML page served with status 200 and a wrong-shaped payload each end in the error state, not a crash (`app/__tests__/list-screen.test.tsx`, "error" group; `mock-api/test/client-integration.test.ts` against the mock API's `malformed-json` and `wrong-schema` modes).
4. **Is the layout collapsing?** A parent `View` without `flex: 1` makes a `FlatList` or `ScrollView` zero height. The content exists but has no height. [knowledge only]
5. **Safe areas and the router:** with expo-router, a missing `_layout.tsx` Stack or a route file that does not `export default` a component renders nothing. [knowledge only]
6. **Missing configuration:** a missing base URL should say so on screen. **[verified here]**: this project shows a "not configured" screen when `resolveBaseUrl` throws (`app/__tests__/layout.test.tsx`).
7. **Splash screen never hides** (when the project uses `expo-splash-screen` and calls `preventAutoHideAsync`): the splash stays up if `hideAsync` is never reached because a font or data load threw. This project does not use it. [knowledge only]

## Red box (or yellow box)

1. Read the **first line**, not the stack. "Cannot read property 'x' of undefined" means data was not what the code expected; "Invariant Violation: Native module cannot be null" or "Tried to register two views with the same name" means a native module or version problem (see the version section). [knowledge only]
2. **Which component?** The red box lists the component stack; the lowest of your own files is the place to look. [knowledge only]
3. **Is it only in development?** Many errors only show as red boxes in dev; a production build shows a crash or a blank screen instead, so reproduce with a release-like build when possible (`npx expo start --no-dev --minify`). [knowledge only]
4. **"Text strings must be rendered within a <Text> component"** means a bare string or a stray `{' '}` or `&&` returning a string inside a `View`. [knowledge only]
5. **Unhandled promise rejection** warnings usually mean a `fetch` with no `catch`. The fix is an error state, as in `app/src/state/useJobList.ts`. [knowledge only] (that every failure path in this project ends in a state, not a rejection: **[verified here]** by the "error" tests; the console-error guard in `app/jest.setup.ts` fails any test that prints a warning)

## Stuck loading spinner

1. **Does the request ever finish?** Open the Network panel in the debugger, or `curl` the URL from the same network as the phone. A request with no timeout hangs forever when the server accepts the connection and never answers. [knowledge only]
2. **Does the loading flag get reset on every path?** The usual bug is `setLoading(false)` only in the success branch. [knowledge only]
3. **Is a response arriving after the screen left?** Or a second request overwriting a newer one? Aborting on unmount and ignoring answers from an older request fixes both. **[verified here]**: `useJobList` aborts on unmount and drops a stale answer, including from a client that ignores the abort signal (`list-screen.test.tsx`, "pull to refresh" and "leaving the screen").
4. **Timeout:** this project's client gives up after 8 s per attempt and retries 5xx, 429 and network errors twice. **[verified here]** against the mock API's `slow` mode, with a 100 ms limit in the test so it runs fast (`client-integration.test.ts`). The real 8 s default was not waited for end to end.
5. **useEffect dependencies:** an effect that depends on an object created every render re-runs forever and re-triggers the load. [knowledge only]

## Metro / Expo version mismatch

1. **Symptoms:** "Unable to resolve module", "Invariant Violation: requireNativeComponent", a red box right after upgrading, "Expo Go version is incompatible with the project SDK". [knowledge only]
2. **Align versions with Expo's own tool, not by hand:** `npx expo install --check` lists packages that differ from what the installed SDK expects; `npx expo install --fix` corrects them; `npx expo-doctor` checks more. [knowledge only] The SDK-to-package table lives in `node_modules/expo/bundledNativeModules.json`; **[verified here]**: `app/package.json` matches it for every package this project depends on that the SDK pins, and the installed versions match what is declared (`app/__tests__/sdk-versions.test.ts`). `npx expo install --check` itself was not run: it crashed on this Mac because the system Node was broken by a Homebrew library change, so the same comparison was done by that test instead.
3. **Clear caches:** `npx expo start --clear`. After switching Node versions or package managers, delete `node_modules` and the lockfile of the *other* manager, then reinstall. [knowledge only]
4. **Expo Go only runs the SDK it ships with.** An app on a newer or older SDK than the installed Expo Go will not open; the fix is a matching Expo Go or a development build. [knowledge only]
5. **Two copies of `react` or `react-native`** in `node_modules` (common in monorepos) cause "Invalid hook call" and duplicate native module errors. `npm ls react react-native` shows it. [knowledge only]
6. **Node version:** use the version the SDK documents. This project's tests ran on Node v25.2.1 only. [verified here, for the tests only]

## "The API works in a browser (or curl) but not on the phone"

The phone is a different computer. `localhost` there means the phone itself.

| Where the app runs | The API on the developer's computer is at | Notes |
|---|---|---|
| iOS Simulator | `http://localhost:PORT` | Shares the Mac's network. [knowledge only] |
| Android emulator | `http://10.0.2.2:PORT` | `10.0.2.2` is the emulator's alias for the host computer. `adb reverse tcp:PORT tcp:PORT` is the other option. [knowledge only] |
| Real phone, same Wi-Fi | `http://<computer LAN IP>:PORT` | The server must listen on all interfaces, the computer's firewall must allow it, and Wi-Fi "client isolation" on some networks blocks phone to computer traffic. [knowledge only] |
| Real phone, other network | A tunnel or a deployed URL (`https`) | `npx expo start --tunnel` tunnels Metro, not your API. [knowledge only] |

**[verified here]** The part about listening addresses, with this project's mock API on macOS: started with its default `--host 127.0.0.1` it answered `http://127.0.0.1:PORT/health` and `http://localhost:PORT/health` with 200 and refused a request to the computer's own LAN IP (curl exit 7, connection refused). Restarted with `--host 0.0.0.0` the LAN IP answered 200. A phone was not involved, so macOS firewall prompts and Wi-Fi isolation were not tested.

Other checks, in order:

1. **Print the URL the app really uses** (log `baseUrl` at start-up; this project fails with a readable screen when it is missing). **[verified here]** for the missing/invalid case only (`config.test.ts`, `layout.test.tsx`).
2. **`EXPO_PUBLIC_` variables are inlined when Metro bundles.** Changing `.env` needs a Metro restart with `--clear`; a variable without the `EXPO_PUBLIC_` prefix is not in the bundle at all. [knowledge only] **[verified here]** that a value given at export time is baked into the exported iOS and Android bundles, and that the bundles contain none of the strings `sk_live`, `sk_test`, `secret_key`, `api_key` or `bearer ` (see the README, "Bundle check"). The variable name itself still appears in the bundle, inside this project's own error message text.
3. **CORS is a browser rule.** A call that works from a web page can fail natively only for other reasons, and a native call that works can fail from Expo web because the server sends no CORS headers. Do not "fix" a native problem by adding CORS. [knowledge only]
4. **Same request in both places:** compare method, headers (especially `Authorization`, `Content-Type`) and body. A `GET` with a body, or a missing `Content-Type: application/json`, behaves differently across stacks. [knowledge only]
5. **IPv6 `localhost`:** `localhost` may resolve to `::1` while the server listens on IPv4 only. Use `127.0.0.1` to rule it out. [knowledge only]

### Cleartext HTTP on Android and App Transport Security on iOS

* **Android 9 and newer block cleartext (`http://`) traffic by default in a built app.** A dev build or release build calling `http://192.168.x.x` fails with a network error although the same URL works in a browser. Fix for development: allow cleartext through the `expo-build-properties` config plugin (`android.usesCleartextTraffic: true`) and rebuild; for production use `https`. Expo Go is reported to allow it, which is why it can "work in Expo Go and fail in the build". [knowledge only]
* **iOS App Transport Security blocks `http://` to non-local hosts** unless the app declares an exception in `Info.plist` (`NSAppTransportSecurity`; in Expo, `ios.infoPlist` in `app.json`). `NSAllowsLocalNetworking` covers local network addresses. For production use `https` with a valid certificate; a self-signed or expired certificate also fails. [knowledge only]
* **Self-signed or hostname-mismatched HTTPS** fails natively with a generic network error; the browser may have a stored exception. [knowledge only]
* This project's default URL is `http://localhost:4010` for local use only. It has no ATS or cleartext configuration, because it has never been built. **Not verified on any device.**

## Fast triage order

1. Metro terminal and red box text. 2. The exact request that fails, with `curl`. 3. Versions against the SDK table. 4. Device type and the URL it uses. 5. Cleartext and ATS. 6. Only then read the app code.
