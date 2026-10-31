#!/usr/bin/env node
// Mutation check: applies ONE deliberate single-line breakage at a time to a throwaway COPY of the project, runs
// the typecheck and the tests, and reports whether any test noticed. A mutant that survives means the tests do not
// pin that behaviour down. The real tree is never modified.
//
//   npm run mutation-check                      run every mutant; exit 1 if any survives, times out or is invalid
//   npm run mutation-check -- --list            list the mutants
//   npm run mutation-check -- --validate        only check that every mutant applies cleanly (no tests run)
//   npm run mutation-check -- --only client-retry-4xx,validate-skip-date-check
//   npm run mutation-check -- --timeout 120000  hard limit per mutant in ms (default 150000)
//   npm run mutation-check -- --report docs/MUTATION-CHECK.md   also write a markdown table of the results
//   npm run mutation-check -- --skip-baseline   skip the unmodified-suite run (only for trying the timeout path)
//   npm run mutation-check -- --self-test       prove the timeout kills a whole process tree (takes ~3 s)
//
// Result words: KILLED (a test failed), SURVIVED (all tests passed), TIMEOUT (hard limit hit, process tree killed,
// counted as NOT killed), INVALID (the mutant did not apply, did not typecheck, or broke the suite instead of a test).
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Each mutant: `find` (or each pair in `edits`) must occur exactly once in `file`; it is replaced by `replace`. */
const MUTANTS = [
  // ---------------- API client: retry rules
  { id: "client-retry-4xx", file: "app/src/api/client.ts", what: "retry every 4xx, not only 429",
    find: "const retryable = status >= 500 || status === 429;", replace: "const retryable = status >= 400 || status === 429;" },
  { id: "client-no-retry-429", file: "app/src/api/client.ts", what: "stop retrying 429",
    find: "const retryable = status >= 500 || status === 429;", replace: "const retryable = status >= 500;" },
  { id: "client-no-retry-500", file: "app/src/api/client.ts", what: "stop retrying a plain 500 (off by one in the status range)",
    find: "const retryable = status >= 500 || status === 429;", replace: "const retryable = status >= 501 || status === 429;" },
  { id: "client-network-not-retryable", file: "app/src/api/client.ts", what: "network errors are no longer retried",
    find: "`Network request failed (${reason})`, { retryable: true }", replace: "`Network request failed (${reason})`, { retryable: false }" },
  { id: "client-timeout-not-retryable", file: "app/src/api/client.ts", what: "timeouts are no longer retried",
    find: "`No answer within ${timeoutMs} ms`, { retryable: true }", replace: "`No answer within ${timeoutMs} ms`, { retryable: false }" },
  { id: "client-off-by-one-retries", file: "app/src/api/client.ts", what: "one attempt fewer than configured",
    find: "attempt > maxRetries ||", replace: "attempt >= maxRetries ||" },
  { id: "client-extra-retry", file: "app/src/api/client.ts", what: "one attempt more than configured",
    find: "attempt > maxRetries ||", replace: "attempt > maxRetries + 1 ||" },
  { id: "client-validation-retryable", file: "app/src/api/client.ts", what: "a wrong-shaped payload is retried",
    find: "`Unexpected response shape at ${cause.message}`, { retryable: false }", replace: "`Unexpected response shape at ${cause.message}`, { retryable: true }" },
  { id: "client-bad-json-retryable", file: "app/src/api/client.ts", what: "a malformed JSON body is retried",
    find: 'throw new ApiError("validation", "The response body is not valid JSON", { retryable: false });', replace: 'throw new ApiError("validation", "The response body is not valid JSON", { retryable: true });' },
  { id: "client-treat-4xx-as-ok", file: "app/src/api/client.ts", what: "only 5xx counts as an HTTP failure (4xx falls through to parsing)",
    find: "if (!response.ok) {", replace: "if (response.status >= 500) {" },
  // ---------------- API client: backoff and Retry-After
  { id: "client-no-backoff-cap", file: "app/src/api/client.ts", what: "backoff step is no longer capped",
    find: "const step = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));", replace: "const step = Math.min(maxDelay * 1000, baseDelay * 2 ** (attempt - 1));" },
  { id: "client-linear-backoff", file: "app/src/api/client.ts", what: "backoff grows linearly instead of doubling",
    find: "2 ** (attempt - 1)", replace: "attempt" },
  { id: "client-ignore-retry-after", file: "app/src/api/client.ts", what: "Retry-After is ignored",
    find: "const wait = Math.max(backoffDelay(attempt), cause.retryAfterMs ?? 0);", replace: "const wait = backoffDelay(attempt);" },
  { id: "client-retry-after-min", file: "app/src/api/client.ts", what: "a short Retry-After shortens the backoff",
    find: "const wait = Math.max(backoffDelay(attempt), cause.retryAfterMs ?? 0);", replace: "const wait = Math.min(backoffDelay(attempt), cause.retryAfterMs ?? Infinity);" },
  { id: "client-wait-forever-retry-after", file: "app/src/api/client.ts", what: "a very long Retry-After is waited for instead of returned",
    find: "cause.retryAfterMs > maxRetryAfter;", replace: "cause.retryAfterMs > maxRetryAfter * 1000;" },
  // ---------------- API client: abort, timeout, requests
  { id: "client-timeout-flag-lost", file: "app/src/api/client.ts", what: "a timeout is reported as a plain network error",
    find: "      timedOut = true;", replace: "      timedOut = false;" },
  { id: "client-timer-leak", file: "app/src/api/client.ts", what: "the per-attempt timer is never cleared",
    find: "    } finally {\n      clearTimeout(timer);\n", replace: "    } finally {\n      void timer;\n" },
  { id: "client-caller-abort-ignored", file: "app/src/api/client.ts", what: "aborting the caller's signal no longer cancels the fetch",
    find: "const onAbort = (): void => controller.abort();", replace: "const onAbort = (): void => {};" },
  { id: "client-abort-retryable", file: "app/src/api/client.ts", what: "an aborted request is marked retryable",
    find: 'new ApiError("aborted", "The request was cancelled", { retryable: false })', replace: 'new ApiError("aborted", "The request was cancelled", { retryable: true })' },
  { id: "client-write-uses-post", file: "app/src/api/client.ts", what: "mark-done sends POST instead of PATCH",
    find: 'return request("PATCH", ', replace: 'return request("POST", ' },
  { id: "client-no-json-content-type", file: "app/src/api/client.ts", what: "the write is sent without a JSON content-type",
    find: '        headers["content-type"] = "application/json";\n', replace: "" },
  { id: "client-id-not-encoded", file: "app/src/api/client.ts", what: "the job id is not URL-encoded in getJob",
    find: 'request("GET", `/jobs/${encodeURIComponent(id)}`', replace: 'request("GET", `/jobs/${id}`' },
  { id: "client-cursor-dropped", file: "app/src/api/client.ts", what: "the pagination cursor is never sent",
    find: "if (params.cursor) query.push(", replace: "if (params.cursor && params.cursor.length < 0) query.push(" },
  // ---------------- response validation
  { id: "validate-any-enum-value", file: "app/src/api/validate.ts", what: "any string is accepted as a status or priority",
    find: " || !(allowed as readonly string[]).includes(value)", replace: "" },
  { id: "validate-blank-title-ok", file: "app/src/api/validate.ts", what: "a whitespace-only string counts as non-empty",
    find: 'if (!opts.allowEmpty && value.trim() === "")', replace: 'if (!opts.allowEmpty && value === "")' },
  { id: "validate-skip-date-check", file: "app/src/api/validate.ts", what: "scheduledAt is not checked to be a date",
    find: 'if (!Number.isFinite(Date.parse(scheduledAt))) throw new ValidationError(`${path}.scheduledAt`, "not a valid date");', replace: "" },
  { id: "validate-notes-any-type", file: "app/src/api/validate.ts", what: "a non-string notes value is silently replaced by an empty string",
    find: 'value["notes"] === undefined ? "" :', replace: 'typeof value["notes"] !== "string" ? "" :' },
  { id: "validate-cursor-undefined-ok", file: "app/src/api/validate.ts", what: "a missing nextCursor is accepted",
    find: 'const nextCursor = value["nextCursor"];', replace: 'const nextCursor = value["nextCursor"] ?? null;' },
  { id: "validate-items-unchecked", file: "app/src/api/validate.ts", what: "items is not checked to be an array",
    edits: [['const items = value["items"];', 'const items = value["items"] as unknown[];'], ["if (!Array.isArray(items)) throw", "if (items === undefined) throw"]] },
  // ---------------- config
  { id: "config-allow-credentials", file: "app/src/api/config.ts", what: "a base URL with user:password@ is accepted",
    find: "if (/^https?:\\/\\/[^/?#]*@/i.test(raw)) throw", replace: "if (false) throw" },
  { id: "config-extra-before-env", file: "app/src/api/config.ts", what: "app.json wins over the environment variable",
    find: "const raw = fromEnv ? fromEnv : typeof fromExtra === \"string\" ? fromExtra.trim() : \"\";", replace: "const raw = typeof fromExtra === \"string\" && fromExtra.trim() ? fromExtra.trim() : fromEnv ?? \"\";" },
  // ---------------- error wording and formatting
  { id: "errors-429-wording", file: "app/src/api/errors.ts", what: "a 429 is described as a generic rejection",
    find: "if (error.status === 429) return", replace: "if (error.status === 428) return" },
  { id: "format-time-slice", file: "app/src/components/format.ts", what: "the scheduled time shows seconds",
    find: "date.toISOString().slice(11, 16)", replace: "date.toISOString().slice(11, 19)" },
  // ---------------- list state
  { id: "list-failed-refresh-wipes-list", file: "app/src/state/useJobList.ts", what: "a failed refresh replaces the old list with the error screen",
    find: 'phase: state.ids.length > 0 ? "ready" : "error"', replace: 'phase: "error"' },
  { id: "list-stale-banner-sticks", file: "app/src/state/useJobList.ts", what: "the stale-data banner is not cleared when a new refresh starts",
    find: "return { ...state, refreshing: true, error: null, loadingMore: false, moreError: null };", replace: "return { ...state, refreshing: true, error: state.error, loadingMore: false, moreError: null };" },
  { id: "list-no-dedupe", file: "app/src/state/useJobList.ts", what: "a job that appears on two pages is listed twice",
    find: "ids: [...state.ids, ...action.ids.filter((id) => !known.has(id))]", replace: "ids: [...state.ids, ...action.ids.filter((id) => !known.has(id) || true)]" },
  { id: "list-more-error-retries-itself", file: "app/src/state/useJobList.ts", what: "reaching the end retries a failed page by itself",
    find: "if (current.moreError && !options.force) return;", replace: "if (current.moreError && !options.force && false) return;" },
  { id: "list-double-load-more", file: "app/src/state/useJobList.ts", what: "reaching the end while a page is loading sends a second request",
    find: "current.loadingMore || current.refreshing", replace: "current.refreshing" },
  { id: "list-no-abort-on-unmount", file: "app/src/state/useJobList.ts", what: "leaving the screen does not cancel the request",
    find: "      generationRef.current += 1;\n      controllerRef.current?.abort();\n", replace: "      generationRef.current += 1;\n" },
  { id: "list-stale-answer-applied", file: "app/src/state/useJobList.ts", what: "an answer from a superseded refresh is applied",
    find: "          if (generation !== generationRef.current) return;\n          cache.upsertMany(page.items);\n          dispatch({ type: \"load-success\"", replace: "          cache.upsertMany(page.items);\n          dispatch({ type: \"load-success\"" },
  { id: "list-refresh-keeps-old-request", file: "app/src/state/useJobList.ts", what: "a new refresh does not cancel the one still running",
    find: "    (kind: \"initial\" | \"refresh\") => {\n      controllerRef.current?.abort();\n", replace: "    (kind: \"initial\" | \"refresh\") => {\n" },
  { id: "list-page-size", file: "app/src/state/useJobList.ts", what: "the page size changes from 10 to 20",
    find: "export const PAGE_SIZE = 10;", replace: "export const PAGE_SIZE = 20;" },
  // ---------------- list screen
  { id: "screen-error-state-skipped", file: "app/src/screens/JobListScreen.tsx", what: "a failed first load shows the empty state instead of the error",
    find: 'if (state.phase === "error" && state.error) {', replace: 'if (state.phase === "error" && state.error && state.ids.length > 99) {' },
  { id: "screen-empty-state-skipped", file: "app/src/screens/JobListScreen.tsx", what: "an empty list renders a blank list instead of the empty state",
    find: "if (jobs.length === 0) {", replace: "if (jobs.length === -1) {" },
  { id: "screen-retry-does-refresh", file: "app/src/screens/JobListScreen.tsx", what: "Retry on the error screen refreshes silently instead of showing loading",
    find: "actionAccessibilityLabel=\"Retry loading jobs\" onAction={reload}", replace: "actionAccessibilityLabel=\"Retry loading jobs\" onAction={() => { void reload; refresh(); }}" },
  { id: "screen-retry-label-lost", file: "app/src/screens/JobListScreen.tsx", what: "the Retry button loses its accessibility label",
    find: 'actionAccessibilityLabel="Retry loading jobs"', replace: 'actionAccessibilityLabel="Retry"' },
  { id: "screen-never-says-offline", file: "app/src/screens/JobListScreen.tsx", what: "the stale banner never mentions being offline",
    find: "staleInfo.offlineish ?", replace: "false ?" },
  { id: "screen-refresh-not-wired", file: "app/src/screens/JobListScreen.tsx", what: "pull to refresh calls nothing",
    find: "<RefreshControl refreshing={state.refreshing} onRefresh={refresh}", replace: "<RefreshControl refreshing={state.refreshing} onRefresh={() => {}}" },
  // ---------------- optimistic write
  { id: "cache-rollback-keeps-done", file: "app/src/state/JobsCache.tsx", what: "a failed write is not rolled back",
    find: 'dispatch({ type: "rolled-back", previous: job,', replace: 'dispatch({ type: "rolled-back", previous: { ...job, status: "done" },' },
  { id: "cache-no-optimistic-update", file: "app/src/state/JobsCache.tsx", what: "the job only changes after the server answers",
    find: '      dispatch({ type: "optimistic", job: { ...job, status: "done" } });\n', replace: "" },
  { id: "cache-refresh-clobbers-write", file: "app/src/state/JobsCache.tsx", what: "a refresh overwrites a job whose write is still in flight",
    find: "jobs: jobs.filter((job) => !inFlight.current.has(job.id))", replace: "jobs" },
  { id: "cache-allows-double-write", file: "app/src/state/JobsCache.tsx", what: "a second write for the same job can start while one is running",
    find: 'if (job.status === "done" || inFlight.current.has(job.id)) return false;', replace: 'if (job.status === "done") return false;' },
  { id: "cache-failure-silent", file: "app/src/state/JobsCache.tsx", what: "a rolled-back write leaves no message",
    find: "writeFailure: action.failure };", replace: "writeFailure: null };" },
  { id: "cache-no-abort-on-unmount", file: "app/src/state/JobsCache.tsx", what: "closing the app does not cancel a running write",
    find: "for (const controller of controllers.values()) controller.abort();", replace: "" },
  // ---------------- detail screen
  { id: "detail-busy-state-lost", file: "app/src/screens/JobDetailScreen.tsx", what: "the button does not report busy while saving",
    find: "accessibilityState={{ disabled: isDone || saving, busy: saving }}", replace: "accessibilityState={{ disabled: isDone || saving, busy: false }}" },
  { id: "detail-404-offers-retry", file: "app/src/screens/JobDetailScreen.tsx", what: "a 404 offers a Retry button",
    find: "{...(notFound ? {} : {", replace: "{...(notFound && false ? {} : {" },
  { id: "detail-refetches-cached-job", file: "app/src/state/useJob.ts", what: "a job already in the list is fetched again",
    find: "if (!hasJobRef.current) load();", replace: "load();" },
  { id: "detail-no-abort-on-leave", file: "app/src/state/useJob.ts", what: "leaving the detail screen does not cancel its request",
    find: "return () => controllerRef.current?.abort();", replace: "return () => {};" },
  // ---------------- app shell
  { id: "layout-swallows-all-errors", file: "app/src/app/_layout.tsx", what: "any startup error is shown as a configuration problem",
    find: "if (error instanceof ConfigError) return { configError: error.message };", replace: "if (error instanceof ConfigError || true) return { configError: String(error) };" },
];

// ---------------------------------------------------------------- process-tree handling

/** Direct and indirect children of `pid`, from `ps`. */
function descendants(pid) {
  const out = spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).stdout ?? "";
  const children = new Map();
  for (const line of out.split("\n")) {
    const [p, pp] = line.trim().split(/\s+/).map(Number);
    if (!p || Number.isNaN(pp)) continue;
    if (!children.has(pp)) children.set(pp, []);
    children.get(pp).push(p);
  }
  const found = [];
  const queue = [pid];
  while (queue.length > 0) {
    const next = queue.pop();
    for (const child of children.get(next) ?? []) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/** SIGKILL the child, everything below it, and its whole process group (it was started with detached: true). */
function killTree(pid) {
  const all = descendants(pid);
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* group already gone */
  }
  for (const p of [pid, ...all]) {
    try {
      process.kill(p, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  return all;
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Runs a command with a hard deadline (an absolute timestamp). Resolves { code, output, timedOut }. */
function run(command, args, { cwd, env, deadline }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const collect = (chunk) => {
      output += chunk;
      if (output.length > 4_000_000) output = output.slice(-2_000_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const remaining = Math.max(1, deadline - Date.now());
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, remaining);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, output, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // whatever is left in the group (a worker that outlived its parent) goes too
      killTree(child.pid);
      resolve({ code, output, timedOut });
    });
  });
}

// ---------------------------------------------------------------- self test

async function selfTest() {
  // A parent that starts a grandchild and then hangs: the timeout must kill all of it and report a timeout.
  const grandchildScript = "setInterval(() => {}, 1000)";
  const parentScript = `
    const { spawn } = require("node:child_process");
    const g = spawn(process.execPath, ["-e", ${JSON.stringify(grandchildScript)}], { stdio: "ignore" });
    console.log("grandchild " + g.pid);
    setInterval(() => {}, 1000);
  `;
  const started = Date.now();
  const child = spawn(process.execPath, ["-e", parentScript], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  let grandchild = 0;
  child.stdout.on("data", (d) => {
    const m = /grandchild (\d+)/.exec(String(d));
    if (m) grandchild = Number(m[1]);
  });
  await new Promise((r) => setTimeout(r, 1200));
  if (!grandchild || !alive(grandchild) || !alive(child.pid)) {
    console.error("self-test: setup failed, the process tree did not start");
    process.exit(2);
  }
  const result = await run(process.execPath, ["-e", parentScript], { cwd: ROOT, env: process.env, deadline: Date.now() + 1000 });
  killTree(child.pid);
  await new Promise((r) => setTimeout(r, 300));
  const leaked = descendants(process.pid).filter((p) => alive(p));
  const ok = result.timedOut && !alive(grandchild) && !alive(child.pid) && leaked.length === 0;
  console.log(`self-test: timedOut=${result.timedOut} grandchildAlive=${alive(grandchild)} leakedProcesses=${leaked.length} (${Date.now() - started} ms)`);
  console.log(ok ? "self-test: PASS, a hung process tree is killed and reported as a timeout" : "self-test: FAIL");
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag("self-test")) await selfTest();

if (flag("list")) {
  for (const m of MUTANTS) console.log(`${m.id.padEnd(34)} ${m.file.padEnd(40)} ${m.what}`);
  process.exit(0);
}

const only = value("only") ? new Set(value("only").split(",")) : null;
const selected = only ? MUTANTS.filter((m) => only.has(m.id)) : MUTANTS;
if (selected.length === 0) {
  console.error("no mutants selected");
  process.exit(2);
}
const ids = new Set();
for (const m of MUTANTS) {
  if (ids.has(m.id)) {
    console.error(`duplicate mutant id ${m.id}`);
    process.exit(2);
  }
  ids.add(m.id);
}
const timeoutMs = Number(value("timeout") ?? 150_000);
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
  console.error("--timeout must be at least 1000 (ms)");
  process.exit(2);
}

/** Applies a mutant to source text. Returns { text } or { invalid }. */
function apply(m, original) {
  const edits = m.edits ?? [[m.find, m.replace]];
  let text = original;
  for (const [find, replace] of edits) {
    const occurrences = text.split(find).length - 1;
    if (occurrences !== 1) return { invalid: `find-string occurs ${occurrences} times (must be exactly 1); the source changed` };
    text = text.replace(find, () => replace);
  }
  if (text === original) return { invalid: "the mutant does not change the file" };
  return { text };
}

if (flag("validate")) {
  let bad = 0;
  for (const m of selected) {
    const r = apply(m, readFileSync(join(ROOT, m.file), "utf8"));
    if (r.invalid) {
      bad += 1;
      console.log(`INVALID ${m.id}: ${r.invalid}`);
    }
  }
  console.log(`${selected.length - bad}/${selected.length} mutants apply cleanly`);
  process.exit(bad ? 1 : 0);
}

// ---- work on a copy so the real tree is never touched
const WORK = join(ROOT, `.mutation-${process.pid}`);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const skip = new Set(["node_modules", ".expo", "dist", "coverage"]);
cpSync(join(ROOT, "app"), join(WORK, "app"), { recursive: true, filter: (src) => !skip.has(src.split("/").pop()) });
cpSync(join(ROOT, "mock-api"), join(WORK, "mock-api"), { recursive: true });
for (const file of ["package.json", "tsconfig.json"]) cpSync(join(ROOT, file), join(WORK, file));
symlinkSync(join(ROOT, "app", "node_modules"), join(WORK, "app", "node_modules"));
symlinkSync(join(ROOT, "node_modules"), join(WORK, "node_modules"));
const cleanup = () => rmSync(WORK, { recursive: true, force: true });
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CI: "1", NODE_NO_WARNINGS: "1" };
const appBin = (name) => join(WORK, "app", "node_modules", ".bin", name);

/** Typecheck, then app tests (Jest), then mock-api and integration tests (node:test), all inside one hard deadline. */
async function runSuite(deadline) {
  const tsc = await run(appBin("tsc"), ["--noEmit"], { cwd: join(WORK, "app"), env, deadline });
  if (tsc.timedOut) return { status: "TIMEOUT", why: "typecheck" };
  if (tsc.code !== 0) return { status: "INVALID", why: "mutant does not typecheck: " + (tsc.output.split("\n").find((l) => l.includes("error")) ?? "").trim() };

  const out = join(WORK, "jest-result.json");
  rmSync(out, { force: true });
  const jest = await run(appBin("jest"), ["--bail=1", "--json", `--outputFile=${out}`], { cwd: join(WORK, "app"), env, deadline });
  if (jest.timedOut) return { status: "TIMEOUT", why: "app tests (Jest)" };
  if (jest.code !== 0) {
    let failed = null;
    let failedCount = 0;
    try {
      const json = JSON.parse(readFileSync(out, "utf8"));
      failedCount = json.numFailedTests;
      for (const file of json.testResults) {
        const bad = file.assertionResults.find((a) => a.status === "failed");
        if (bad) {
          failed = `${file.name.split("/__tests__/").pop()} > ${bad.fullName}`;
          break;
        }
      }
    } catch {
      /* no result file */
    }
    if (failedCount > 0 && failed) return { status: "KILLED", why: failed };
    return { status: "INVALID", why: "the Jest run failed without a failing test (suite did not run)" };
  }

  const node = await run(process.execPath, ["--import", "./mock-api/test/register-ts-resolve.mjs", "--test", "mock-api/test/*.test.ts"], { cwd: WORK, env, deadline });
  if (node.timedOut) return { status: "TIMEOUT", why: "mock-api and integration tests (node:test)" };
  if (node.code !== 0) {
    const first = node.output.split("\n").find((l) => l.includes("✖")) ?? "node:test failed";
    return { status: "KILLED", why: `mock-api/test > ${first.replace(/^[\s✖]+/, "").replace(/\s*\(\d.*$/, "")}` };
  }
  return { status: "SURVIVED", why: "" };
}

console.log(`mutation check: ${selected.length} mutants, hard limit ${Math.round(timeoutMs / 1000)} s each`);
console.log("baseline: running the unmodified suite in the copy...");
const baseline = flag("skip-baseline") ? { status: "SURVIVED", why: "" } : await runSuite(Date.now() + timeoutMs * 2);
if (baseline.status !== "SURVIVED") {
  console.error(`baseline suite does not pass (${baseline.status}: ${baseline.why}); fix that before a mutation check is meaningful.`);
  process.exit(2);
}

const results = [];
for (const m of selected) {
  const original = readFileSync(join(ROOT, m.file), "utf8");
  const applied = apply(m, original);
  if (applied.invalid) {
    results.push({ ...m, status: "INVALID", why: applied.invalid });
    console.log(`INVALID   ${m.id}: ${applied.invalid}`);
    continue;
  }
  const target = join(WORK, m.file);
  writeFileSync(target, applied.text);
  const started = Date.now();
  let result;
  try {
    result = await runSuite(started + timeoutMs);
  } finally {
    writeFileSync(target, original);
  }
  results.push({ ...m, ...result });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${result.status.padEnd(9)} ${m.id.padEnd(34)} ${seconds.padStart(5)} s  ${result.status === "KILLED" ? `<- ${result.why}` : result.why}`);
}

const count = (status) => results.filter((r) => r.status === status).length;
const killed = count("KILLED");
const valid = results.length - count("INVALID");
console.log("\nMutation check");
console.log("--------------");
console.log(`mutants run : ${results.length}`);
console.log(`killed      : ${killed}`);
console.log(`survived    : ${count("SURVIVED")}`);
console.log(`timeout     : ${count("TIMEOUT")} (counted as not killed)`);
console.log(`invalid     : ${count("INVALID")}`);
console.log(`kill rate   : ${valid === 0 ? "n/a" : `${((killed / valid) * 100).toFixed(1)}%`} (${killed}/${valid} valid mutants)`);
for (const r of results) if (r.status !== "KILLED") console.log(`  ${r.status} ${r.id}: ${r.what}  [${r.file}] ${r.why}`);

const reportPath = value("report");
if (reportPath) {
  const rows = results.map((r) => `| ${r.id} | \`${r.file.replace(/^app\/src\//, "app/src/")}\` | ${r.what} | ${r.status} | ${r.status === "KILLED" ? r.why.replace(/\|/g, "\\|") : r.why} |`);
  const text = [
    "# Mutation check results",
    "",
    `Snapshot of \`npm run mutation-check\` (${results.length} mutants, each applied alone to a throwaway copy; the typecheck, the Jest suite and the Node suite run for each). KILLED means a test failed, SURVIVED means every test passed, TIMEOUT counts as not killed.`,
    "",
    `Killed ${killed} of ${valid} valid mutants; survived ${count("SURVIVED")}; timeout ${count("TIMEOUT")}; invalid ${count("INVALID")}.`,
    "",
    "| Mutant | File | Breakage | Result | First failing test |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
  writeFileSync(join(ROOT, reportPath), text);
  console.log(`report written to ${reportPath}`);
}
process.exit(count("SURVIVED") + count("TIMEOUT") + count("INVALID") > 0 ? 1 : 0);
