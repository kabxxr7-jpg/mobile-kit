import { createApiClient, parseRetryAfter, type ApiClientOptions } from "../src/api/client";
import { ApiError } from "../src/api/errors";
import { createFakeFetch, type Step } from "./helpers/fakeFetch";
import { makeJob, makePage } from "./helpers/fixtures";

const BASE = "http://api.test";

/** A client whose sleeping is recorded and instant, so retry tests take no real time. */
function setup(steps: Step[], options: Partial<ApiClientOptions> = {}) {
  const { fetch, calls } = createFakeFetch(steps);
  const sleeps: number[] = [];
  const client = createApiClient({
    baseUrl: BASE,
    fetch,
    random: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  return { client, calls, sleeps };
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected the call to fail");
}

describe("requests", () => {
  test("listJobs sends a GET with the accept header and returns the parsed page", async () => {
    const page = makePage(1, 3, "abc");
    const { client, calls } = setup([{ json: page }]);
    await expect(client.listJobs()).resolves.toEqual(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: `${BASE}/jobs`, method: "GET", headers: { accept: "application/json" }, body: undefined });
  });

  test("listJobs puts cursor and limit in the query string, encoded", async () => {
    const { client, calls } = setup([{ json: makePage(1, 1, null) }]);
    await client.listJobs({ cursor: "a+b/c=", limit: 5 });
    expect(calls[0]?.url).toBe(`${BASE}/jobs?cursor=a%2Bb%2Fc%3D&limit=5`);
  });

  test("a null or empty cursor is left out", async () => {
    const { client, calls } = setup([{ json: makePage(1, 1, null) }]);
    await client.listJobs({ cursor: null });
    await client.listJobs({ cursor: "" });
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/jobs`, `${BASE}/jobs`]);
  });

  test("a trailing slash on the base URL does not double up", async () => {
    const { client, calls } = setup([{ json: makeJob(1) }], { baseUrl: `${BASE}//` });
    await client.getJob("job-001");
    expect(calls[0]?.url).toBe(`${BASE}/jobs/job-001`);
  });

  test("getJob encodes the id", async () => {
    const { client, calls } = setup([{ json: makeJob(1) }]);
    await client.getJob("a/b c");
    expect(calls[0]?.url).toBe(`${BASE}/jobs/a%2Fb%20c`);
  });

  test("setJobStatus sends a PATCH with a JSON body and returns the updated job", async () => {
    const done = makeJob(2, { status: "done" });
    const { client, calls } = setup([{ json: done }]);
    await expect(client.setJobStatus("job-002", "done")).resolves.toEqual(done);
    expect(calls[0]).toMatchObject({
      url: `${BASE}/jobs/job-002`,
      method: "PATCH",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  });
});

describe("retry", () => {
  test.each([500, 502, 503, 504])("retries a %i and returns the later success", async (status) => {
    const { client, calls } = setup([{ json: {}, status }, { json: makePage(1, 2, null) }]);
    await expect(client.listJobs()).resolves.toEqual(makePage(1, 2, null));
    expect(calls).toHaveLength(2);
  });

  test("retries a 429", async () => {
    const { client, calls } = setup([{ json: {}, status: 429 }, { json: makePage(1, 1, null) }]);
    await client.listJobs();
    expect(calls).toHaveLength(2);
  });

  test("gives up after 1 + maxRetries attempts and reports how many it made", async () => {
    const { client, calls } = setup([{ json: {}, status: 500 }]);
    const error = await failureOf(client.listJobs());
    expect(calls).toHaveLength(3);
    expect(error).toMatchObject({ kind: "http", status: 500, retryable: true, attempts: 3 });
  });

  test("maxRetries 0 means a single attempt; maxRetries 4 means five", async () => {
    const none = setup([{ json: {}, status: 503 }], { maxRetries: 0 });
    await failureOf(none.client.listJobs());
    expect(none.calls).toHaveLength(1);
    const many = setup([{ json: {}, status: 503 }], { maxRetries: 4 });
    await failureOf(many.client.listJobs());
    expect(many.calls).toHaveLength(5);
  });

  test.each([400, 401, 403, 404, 409, 422])("does not retry a %i", async (status) => {
    const { client, calls, sleeps } = setup([{ json: { error: "nope" }, status }, { json: makePage(1, 1, null) }]);
    const error = await failureOf(client.listJobs());
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(error).toMatchObject({ kind: "http", status, retryable: false, attempts: 1 });
  });

  test("retries a network error and then succeeds", async () => {
    const { client, calls } = setup([{ throws: new TypeError("Network request failed") }, { json: makePage(1, 1, null) }]);
    await expect(client.listJobs()).resolves.toEqual(makePage(1, 1, null));
    expect(calls).toHaveLength(2);
  });

  test("a network error that never recovers is reported as kind network", async () => {
    const { client, calls } = setup([{ throws: new TypeError("Network request failed") }]);
    const error = await failureOf(client.listJobs());
    expect(calls).toHaveLength(3);
    expect(error).toMatchObject({ kind: "network", retryable: true, attempts: 3 });
  });

  test("the write is retried too (setting a status twice is harmless) and re-sends the same body", async () => {
    const { client, calls } = setup([{ json: {}, status: 503 }, { json: makeJob(1, { status: "done" }) }]);
    await client.setJobStatus("job-001", "done");
    expect(calls.map((c) => c.body)).toEqual([JSON.stringify({ status: "done" }), JSON.stringify({ status: "done" })]);
  });

  test("a bad payload is never retried", async () => {
    const { client, calls } = setup([{ json: { jobs: [] } }, { json: makePage(1, 1, null) }]);
    const error = await failureOf(client.listJobs());
    expect(calls).toHaveLength(1);
    expect(error).toMatchObject({ kind: "validation", retryable: false });
  });
});

describe("backoff", () => {
  test("doubles each retry, with no jitter when random is 0 (half of the step)", async () => {
    const { client, sleeps } = setup([{ json: {}, status: 500 }], { maxRetries: 3, retryBaseDelayMs: 400, retryMaxDelayMs: 100_000, random: () => 0 });
    await failureOf(client.listJobs());
    expect(sleeps).toEqual([200, 400, 800]);
  });

  test("full jitter reaches the whole step", async () => {
    const { client, sleeps } = setup([{ json: {}, status: 500 }], { maxRetries: 3, retryBaseDelayMs: 400, retryMaxDelayMs: 100_000, random: () => 0.999999 });
    await failureOf(client.listJobs());
    expect(sleeps).toEqual([400, 800, 1600]);
  });

  test("one step never exceeds retryMaxDelayMs", async () => {
    const { client, sleeps } = setup([{ json: {}, status: 500 }], { maxRetries: 4, retryBaseDelayMs: 1000, retryMaxDelayMs: 2500, random: () => 0.999999 });
    await failureOf(client.listJobs());
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(2500);
    expect(sleeps.slice(-2)).toEqual([2500, 2500]);
  });

  test("Retry-After on a 429 is waited for when it is longer than the backoff", async () => {
    const { client, sleeps } = setup([{ json: {}, status: 429, headers: { "retry-after": "3" } }, { json: makePage(1, 1, null) }]);
    await client.listJobs();
    expect(sleeps).toEqual([3000]);
  });

  test("a short Retry-After does not shorten the backoff", async () => {
    const { client, sleeps } = setup([{ json: {}, status: 429, headers: { "retry-after": "0" } }, { json: makePage(1, 1, null) }], { retryBaseDelayMs: 1000, random: () => 0.999999 });
    await client.listJobs();
    expect(sleeps).toEqual([1000]);
  });

  test("a Retry-After longer than maxRetryAfterMs is not waited for: one attempt, error returned", async () => {
    const { client, calls, sleeps } = setup([{ json: {}, status: 429, headers: { "retry-after": "120" } }, { json: makePage(1, 1, null) }]);
    const error = await failureOf(client.listJobs());
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(error).toMatchObject({ kind: "http", status: 429, retryAfterMs: 120_000 });
  });

  test("parseRetryAfter reads seconds, HTTP dates, and ignores junk", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter(" 0 ")).toBe(0);
    expect(parseRetryAfter("soon")).toBeUndefined();
    const now = Date.parse("2026-06-01T12:00:00Z");
    expect(parseRetryAfter("Mon, 01 Jun 2026 12:00:07 GMT", now)).toBe(7000);
    expect(parseRetryAfter("Mon, 01 Jun 2026 11:00:00 GMT", now)).toBe(0);
  });
});

describe("timeout and abort", () => {
  test("a request that never answers times out with kind timeout and is retried", async () => {
    const { client, calls } = setup([{ hang: true }], { timeoutMs: 15, maxRetries: 1 });
    const error = await failureOf(client.listJobs());
    expect(calls).toHaveLength(2);
    expect(error).toMatchObject({ kind: "timeout", retryable: true, attempts: 2 });
    expect(calls.every((c) => c.signal?.aborted)).toBe(true);
  });

  test("a body that never arrives also times out", async () => {
    const { client } = setup([{ hangBody: true }], { timeoutMs: 15, maxRetries: 0 });
    await expect(failureOf(client.listJobs())).resolves.toMatchObject({ kind: "timeout" });
  });

  test("a slow first attempt followed by a fast one succeeds", async () => {
    const { client, calls } = setup([{ hang: true }, { json: makePage(1, 1, null) }], { timeoutMs: 15 });
    await expect(client.listJobs()).resolves.toEqual(makePage(1, 1, null));
    expect(calls).toHaveLength(2);
  });

  test("no timer is left running after success or failure", async () => {
    jest.useFakeTimers();
    try {
      const ok = setup([{ json: makePage(1, 1, null) }]);
      await ok.client.listJobs();
      expect(jest.getTimerCount()).toBe(0);
      const bad = setup([{ json: {}, status: 400 }]);
      await failureOf(bad.client.listJobs());
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("aborting before the call never reaches fetch", async () => {
    const { client, calls } = setup([{ json: makePage(1, 1, null) }]);
    const controller = new AbortController();
    controller.abort();
    const error = await failureOf(client.listJobs({}, { signal: controller.signal }));
    expect(error.kind).toBe("aborted");
    expect(calls).toHaveLength(0);
  });

  test("aborting mid-flight rejects with kind aborted and does not retry", async () => {
    const { client, calls } = setup([{ hang: true }], { timeoutMs: 5000 });
    const controller = new AbortController();
    const pending = failureOf(client.listJobs({}, { signal: controller.signal }));
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    const error = await pending;
    expect(error).toMatchObject({ kind: "aborted", retryable: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal?.aborted).toBe(true);
  });

  test("aborting while waiting to retry stops at once", async () => {
    const { fetch, calls } = createFakeFetch([{ json: {}, status: 503 }]);
    const client = createApiClient({ baseUrl: BASE, fetch, retryBaseDelayMs: 60_000, retryMaxDelayMs: 60_000, random: () => 1 });
    const controller = new AbortController();
    const started = Date.now();
    const pending = failureOf(client.listJobs({}, { signal: controller.signal }));
    await new Promise((r) => setTimeout(r, 30));
    controller.abort();
    const error = await pending;
    expect(error.kind).toBe("aborted");
    expect(Date.now() - started).toBeLessThan(5000);
    expect(calls).toHaveLength(1);
  });

  test("an abort that arrives after the call finished does no harm", async () => {
    const { client } = setup([{ json: makePage(1, 1, null) }]);
    const controller = new AbortController();
    await client.listJobs({}, { signal: controller.signal });
    expect(() => controller.abort()).not.toThrow();
  });
});

describe("response validation", () => {
  test("a 200 whose body is cut off is a validation error, not a crash", async () => {
    const { client } = setup([{ text: '{"items":[{"id":"job-001","title":"Replace boil' }]);
    const error = await failureOf(client.listJobs());
    expect(error).toMatchObject({ kind: "validation", retryable: false });
    expect(error.message).toMatch(/not valid JSON/);
  });

  test("an HTML error page served with status 200 is a validation error", async () => {
    const { client } = setup([{ text: "<html><body>Captive portal login</body></html>" }]);
    await expect(failureOf(client.listJobs())).resolves.toMatchObject({ kind: "validation" });
  });

  test("valid JSON of the wrong shape names the offending field", async () => {
    const page = makePage(1, 2, null);
    const broken = { ...page, items: [page.items[0], { ...page.items[1], status: "finished" }] };
    const { client } = setup([{ json: broken }]);
    const error = await failureOf(client.listJobs());
    expect(error).toMatchObject({ kind: "validation" });
    expect(error.message).toContain("page.items[1].status");
  });

  test("getJob and setJobStatus validate their payloads too", async () => {
    const one = setup([{ json: { id: 7, title: null } }]);
    await expect(failureOf(one.client.getJob("job-001"))).resolves.toMatchObject({ kind: "validation" });
    const two = setup([{ json: { ok: true } }]);
    await expect(failureOf(two.client.setJobStatus("job-001", "done"))).resolves.toMatchObject({ kind: "validation" });
  });

  test("server error text is not copied into the error message", async () => {
    const { client } = setup([{ json: { error: "SECRET stack trace at db.js:42" }, status: 400 }]);
    const error = await failureOf(client.listJobs());
    expect(error.message).not.toContain("SECRET");
    expect(error.message).toBe("HTTP 400");
  });
});
