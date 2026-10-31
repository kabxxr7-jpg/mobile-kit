import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { DEFAULT_PAGE_SIZE, TOTAL_JOBS, buildJobs, createMockApi, type Job, type MockApi } from "../server.ts";

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

async function getJson(path: string, init?: RequestInit): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(`${base}${path}`, init);
  return { status: res.status, body: await res.json(), headers: res.headers };
}
function setMode(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${base}/__admin/mode`, { method: "POST", body: JSON.stringify(body) });
}
function patchStatus(id: string, status: unknown): Promise<Response> {
  return fetch(`${base}/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

describe("data", () => {
  test("is deterministic and fictional-looking", () => {
    assert.deepEqual(buildJobs(), buildJobs());
    const jobs = buildJobs();
    assert.equal(jobs.length, TOTAL_JOBS);
    assert.equal(new Set(jobs.map((j) => j.id)).size, TOTAL_JOBS);
    assert.equal(jobs[0]?.id, "job-001");
    assert.ok(jobs.some((j) => j.status === "done") && jobs.some((j) => j.status === "open") && jobs.some((j) => j.status === "in_progress"));
  });

  test("health answers 200", async () => {
    const r = await getJson("/health");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  });
});

describe("pagination", () => {
  test("walks all pages with the cursor and ends with a null cursor", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: { body: { items: Job[]; nextCursor: string | null } } = await getJson(cursor ? `/jobs?cursor=${cursor}` : "/jobs");
      pages += 1;
      assert.ok(r.body.items.length <= DEFAULT_PAGE_SIZE);
      seen.push(...r.body.items.map((j) => j.id));
      cursor = r.body.nextCursor;
    } while (cursor !== null && pages < 10);
    assert.equal(pages, 3);
    assert.equal(seen.length, TOTAL_JOBS);
    assert.equal(new Set(seen).size, TOTAL_JOBS);
  });

  test("honours limit, and rejects bad limit and cursor with 400", async () => {
    assert.equal((await getJson("/jobs?limit=5")).body.items.length, 5);
    for (const bad of ["0", "51", "abc", "1.5"]) assert.equal((await getJson(`/jobs?limit=${bad}`)).status, 400, `limit=${bad}`);
    assert.equal((await getJson("/jobs?cursor=not-a-cursor")).status, 400);
  });

  test("a cursor past the end gives an empty last page", async () => {
    const cursor = Buffer.from("offset:500").toString("base64url");
    const r = await getJson(`/jobs?cursor=${cursor}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { items: [], nextCursor: null });
  });
});

describe("single job and the write", () => {
  test("GET one job, 404 for an unknown id", async () => {
    assert.equal((await getJson("/jobs/job-002")).body.id, "job-002");
    const missing = await getJson("/jobs/job-999");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "job_not_found");
  });

  test("PATCH marks a job done and the list shows it; repeating it is harmless", async () => {
    const before = await getJson("/jobs/job-001");
    assert.notEqual(before.body.status, "done");
    const first = await patchStatus("job-001", "done");
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as Job).status, "done");
    assert.equal((await patchStatus("job-001", "done")).status, 200);
    assert.equal((await getJson("/jobs/job-001")).body.status, "done");
    assert.equal((await getJson("/jobs")).body.items[0].status, "done");
  });

  test("PATCH validates input", async () => {
    assert.equal((await patchStatus("job-001", "finished")).status, 400);
    assert.equal((await patchStatus("job-001", 5)).status, 400);
    assert.equal((await patchStatus("job-999", "done")).status, 404);
    const garbage = await fetch(`${base}/jobs/job-001`, { method: "PATCH", body: "not json" });
    assert.equal(garbage.status, 400);
    const huge = await fetch(`${base}/jobs/job-001`, { method: "PATCH", body: JSON.stringify({ status: "x".repeat(20_000) }) });
    assert.equal(huge.status, 413);
  });

  test("unknown routes are 404 and wrong methods 405", async () => {
    assert.equal((await getJson("/nope")).status, 404);
    assert.equal((await getJson("/jobs", { method: "POST", body: "{}" })).status, 405);
    assert.equal((await getJson("/jobs/job-001", { method: "DELETE" })).status, 405);
  });
});

describe("failure modes", () => {
  test("error500 answers 500 on reads and writes", async () => {
    await setMode({ mode: "error500" });
    const r = await getJson("/jobs");
    assert.equal(r.status, 500);
    assert.equal((await patchStatus("job-001", "done")).status, 500);
  });

  test("rate-limit answers 429 with the configured Retry-After", async () => {
    await setMode({ mode: "rate-limit", retryAfterSeconds: 7 });
    const r = await getJson("/jobs");
    assert.equal(r.status, 429);
    assert.equal(r.headers.get("retry-after"), "7");
  });

  test("malformed-json answers 200 with a body that does not parse", async () => {
    await setMode({ mode: "malformed-json" });
    const res = await fetch(`${base}/jobs`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.throws(() => JSON.parse(text));
  });

  test("empty returns an empty list but leaves single jobs alone", async () => {
    await setMode({ mode: "empty" });
    assert.deepEqual((await getJson("/jobs")).body, { items: [], nextCursor: null });
    assert.equal((await getJson("/jobs/job-001")).body.id, "job-001");
  });

  test("wrong-schema answers 200 with valid JSON of the wrong shape", async () => {
    await setMode({ mode: "wrong-schema" });
    const list = await getJson("/jobs");
    assert.equal(list.status, 200);
    assert.equal(list.body.items, undefined);
    const one = await getJson("/jobs/job-001");
    assert.equal(one.status, 200);
    assert.equal(one.body.title, null);
  });

  test("slow delays the answer by delayMs", async () => {
    await setMode({ mode: "slow", delayMs: 300 });
    const started = Date.now();
    const r = await getJson("/jobs");
    assert.equal(r.status, 200);
    assert.ok(Date.now() - started >= 280, "answer came back too early");
  });

  test("slow: a client that gives up does not break the server", async () => {
    await setMode({ mode: "slow", delayMs: 5000 });
    const controller = new AbortController();
    const pending = fetch(`${base}/jobs`, { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, { name: "AbortError" });
    await setMode({ mode: "normal" });
    assert.equal((await getJson("/health")).status, 200);
    assert.equal((await getJson("/jobs")).status, 200);
  });

  test("times: only the first N matching requests fail, then it recovers on its own", async () => {
    await setMode({ mode: "error500", times: 2 });
    assert.equal((await getJson("/jobs")).status, 500);
    assert.equal((await getJson("/jobs")).status, 500);
    assert.equal((await getJson("/jobs")).status, 200);
    const state = await getJson("/__admin/state");
    assert.equal(state.body.config.mode, "normal");
    assert.equal(state.body.affected, 2);
    assert.equal(state.body.requests, 3);
  });

  test("scope: read-only mode leaves writes alone and does not use up times", async () => {
    await setMode({ mode: "error500", scope: "read", times: 1 });
    assert.equal((await patchStatus("job-001", "done")).status, 200);
    assert.equal((await getJson("/jobs")).status, 500);
    assert.equal((await getJson("/jobs")).status, 200);
  });

  test("scope: write-only mode leaves reads alone", async () => {
    await setMode({ mode: "error500", scope: "write" });
    assert.equal((await getJson("/jobs")).status, 200);
    assert.equal((await patchStatus("job-001", "done")).status, 500);
    assert.equal((await getJson("/jobs/job-001")).body.status === "done", false, "a failed write must not change data");
  });

  test("health and admin requests are never affected or counted", async () => {
    await setMode({ mode: "error500" });
    assert.equal((await getJson("/health")).status, 200);
    const state = await getJson("/__admin/state");
    assert.equal(state.body.requests, 0);
  });
});

describe("admin", () => {
  test("rejects bad mode, scope and numbers", async () => {
    assert.equal((await setMode({ mode: "explode" })).status, 400);
    assert.equal((await setMode({ mode: "slow", scope: "everything" })).status, 400);
    assert.equal((await setMode({ mode: "slow", delayMs: -1 })).status, 400);
    assert.equal((await setMode({ mode: "slow", times: 0 })).status, 400);
    assert.equal((await setMode({ mode: "slow", times: 1.5 })).status, 400);
    const notObject = await fetch(`${base}/__admin/mode`, { method: "POST", body: "[]" });
    assert.equal(notObject.status, 400);
  });

  test("reset restores data, mode and counters", async () => {
    await patchStatus("job-001", "done");
    await setMode({ mode: "empty" });
    await getJson("/jobs");
    await fetch(`${base}/__admin/reset`, { method: "POST" });
    const state = await getJson("/__admin/state");
    assert.equal(state.body.config.mode, "normal");
    assert.equal(state.body.requests, 0);
    assert.equal((await getJson("/jobs/job-001")).body.status, "open");
  });
});
