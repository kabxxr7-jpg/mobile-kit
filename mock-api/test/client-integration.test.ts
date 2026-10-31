// The app's real API client (app/src/api/client.ts, run by plain Node) talking to the real mock API over real
// sockets with Node's real fetch. No React Native, no Jest, no fakes: this is the contract check between the two.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { TOTAL_JOBS, createMockApi, type MockApi } from "../server.ts";

interface ClientLike {
  listJobs(params?: { cursor?: string | null; limit?: number }, options?: { signal?: AbortSignal }): Promise<{ items: { id: string; status: string }[]; nextCursor: string | null }>;
  getJob(id: string, options?: { signal?: AbortSignal }): Promise<{ id: string; status: string }>;
  setJobStatus(id: string, status: string, options?: { signal?: AbortSignal }): Promise<{ id: string; status: string }>;
}
interface ClientModule {
  createApiClient(options: { baseUrl: string; timeoutMs?: number; maxRetries?: number; retryBaseDelayMs?: number; retryMaxDelayMs?: number }): ClientLike;
}
const clientModule = (await import(pathToFileURL(join(import.meta.dirname, "../../app/src/api/client.ts")).href)) as ClientModule;

let api: MockApi;
let base = "";
before(async () => {
  api = createMockApi();
  base = (await api.listen(0, "127.0.0.1")).url;
});
after(async () => {
  await api.close();
});
beforeEach(async () => {
  await fetch(`${base}/__admin/reset`, { method: "POST" });
});

const fast = { retryBaseDelayMs: 5, retryMaxDelayMs: 20 };
const client = (options: Partial<Parameters<ClientModule["createApiClient"]>[0]> = {}): ClientLike =>
  clientModule.createApiClient({ baseUrl: base, ...fast, ...options });
const setMode = (body: Record<string, unknown>): Promise<Response> => fetch(`${base}/__admin/mode`, { method: "POST", body: JSON.stringify(body) });
const requests = async (): Promise<number> => ((await (await fetch(`${base}/__admin/state`)).json()) as { requests: number }).requests;

async function failureOf(promise: Promise<unknown>): Promise<{ kind: string; status?: number; attempts: number; retryable: boolean }> {
  try {
    await promise;
  } catch (error) {
    return error as { kind: string; status?: number; attempts: number; retryable: boolean };
  }
  throw new Error("expected the call to fail");
}

describe("happy path (the app's validator accepts everything the mock sends)", () => {
  test("walks every page and gets all jobs", async () => {
    const c = client();
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<ClientLike["listJobs"]>> = await c.listJobs({ cursor, limit: 10 });
      ids.push(...page.items.map((j) => j.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    assert.equal(ids.length, TOTAL_JOBS);
    assert.equal(new Set(ids).size, TOTAL_JOBS);
  });

  test("getJob and setJobStatus round-trip", async () => {
    const c = client();
    assert.equal((await c.getJob("job-001")).status, "open");
    assert.equal((await c.setJobStatus("job-001", "done")).status, "done");
    assert.equal((await c.getJob("job-001")).status, "done");
  });

  test("a 404 is reported once and not retried", async () => {
    const error = await failureOf(client().getJob("job-999"));
    assert.deepEqual({ kind: error.kind, status: error.status, attempts: error.attempts, retryable: error.retryable }, { kind: "http", status: 404, attempts: 1, retryable: false });
    assert.equal(await requests(), 1);
  });

  test("an empty list is a valid page", async () => {
    await setMode({ mode: "empty" });
    assert.deepEqual(await client().listJobs(), { items: [], nextCursor: null });
  });
});

describe("failure modes", () => {
  test("two 500s then success: the client retries and the caller never sees the failure", async () => {
    await setMode({ mode: "error500", times: 2 });
    const page = await client().listJobs();
    assert.equal(page.items.length, 10);
    assert.equal(await requests(), 3);
  });

  test("a permanent 500 is retried twice, then reported with the attempt count", async () => {
    await setMode({ mode: "error500" });
    const error = await failureOf(client().listJobs());
    assert.deepEqual({ kind: error.kind, status: error.status, attempts: error.attempts }, { kind: "http", status: 500, attempts: 3 });
    assert.equal(await requests(), 3);
  });

  test("a 429 with Retry-After: 1 is waited out (about a second) and then succeeds", async () => {
    await setMode({ mode: "rate-limit", retryAfterSeconds: 1, times: 1 });
    const started = Date.now();
    await client().listJobs();
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 950, `returned after ${elapsed} ms, before the Retry-After second had passed`);
    assert.equal(await requests(), 2);
  });

  test("a truncated JSON body is a validation error and is not retried", async () => {
    await setMode({ mode: "malformed-json" });
    const error = await failureOf(client().listJobs());
    assert.deepEqual({ kind: error.kind, attempts: error.attempts, retryable: error.retryable }, { kind: "validation", attempts: 1, retryable: false });
    assert.equal(await requests(), 1);
  });

  test("valid JSON of the wrong shape is a validation error, for the list and for one job", async () => {
    await setMode({ mode: "wrong-schema" });
    assert.equal((await failureOf(client().listJobs())).kind, "validation");
    assert.equal((await failureOf(client().getJob("job-001"))).kind, "validation");
    assert.equal(await requests(), 2);
  });

  test("a slow server hits the per-attempt timeout; with one retry that is two attempts", async () => {
    await setMode({ mode: "slow", delayMs: 3000 });
    const started = Date.now();
    const error = await failureOf(client({ timeoutMs: 100, maxRetries: 1 }).listJobs());
    assert.deepEqual({ kind: error.kind, attempts: error.attempts }, { kind: "timeout", attempts: 2 });
    assert.ok(Date.now() - started < 2000, "timeouts did not cut the wait short");
    assert.equal(await requests(), 2);
  });

  test("aborting a slow request returns kind aborted straight away and is not retried", async () => {
    await setMode({ mode: "slow", delayMs: 3000 });
    const controller = new AbortController();
    const pending = failureOf(client({ timeoutMs: 10_000 }).listJobs({}, { signal: controller.signal }));
    setTimeout(() => controller.abort(), 50);
    const started = Date.now();
    const error = await pending;
    assert.equal(error.kind, "aborted");
    assert.ok(Date.now() - started < 1000);
    assert.equal(await requests(), 1);
  });

  test("a failing write is reported after retries and leaves the data unchanged", async () => {
    await setMode({ mode: "error500", scope: "write" });
    const error = await failureOf(client().setJobStatus("job-001", "done"));
    assert.deepEqual({ kind: error.kind, status: error.status, attempts: error.attempts }, { kind: "http", status: 500, attempts: 3 });
    await setMode({ mode: "normal" });
    assert.equal((await client().getJob("job-001")).status, "open");
  });

  test("a server that is not there is a network error, retried, then reported", async () => {
    const free = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address() as { port: number };
        probe.close(() => resolve(port));
      });
    });
    const error = await failureOf(client({ baseUrl: `http://127.0.0.1:${free}` }).listJobs());
    assert.deepEqual({ kind: error.kind, attempts: error.attempts, retryable: error.retryable }, { kind: "network", attempts: 3, retryable: true });
  });
});
