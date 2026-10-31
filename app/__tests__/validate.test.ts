import { parseJob, parseJobPage, ValidationError } from "../src/api/validate";
import { makeJob } from "./helpers/fixtures";

function problemOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.path;
    throw error;
  }
  throw new Error("expected a ValidationError");
}

describe("parseJob", () => {
  test("accepts a complete job and returns exactly the known fields", () => {
    const job = makeJob(1, { notes: "Key at the front desk." });
    expect(parseJob({ ...job, extra: "ignored" })).toEqual(job);
  });

  test("notes may be absent (becomes an empty string) or empty", () => {
    const { notes: _notes, ...withoutNotes } = makeJob(1);
    expect(parseJob(withoutNotes).notes).toBe("");
    expect(parseJob(makeJob(1, { notes: "" })).notes).toBe("");
  });

  test.each([null, undefined, 5, "job", [], true])("rejects %p as a job", (value) => {
    expect(problemOf(() => parseJob(value))).toBe("job");
  });

  test.each(["id", "title", "customer", "address", "status", "priority", "scheduledAt"])("rejects a job without %s", (key) => {
    const job: Record<string, unknown> = { ...makeJob(1) };
    delete job[key];
    expect(problemOf(() => parseJob(job))).toBe(`job.${key}`);
  });

  test.each(["id", "title", "customer", "address"])("rejects an empty or blank %s", (key) => {
    expect(problemOf(() => parseJob({ ...makeJob(1), [key]: "" }))).toBe(`job.${key}`);
    expect(problemOf(() => parseJob({ ...makeJob(1), [key]: "   " }))).toBe(`job.${key}`);
  });

  test("rejects wrong types", () => {
    expect(problemOf(() => parseJob({ ...makeJob(1), id: 7 }))).toBe("job.id");
    expect(problemOf(() => parseJob({ ...makeJob(1), title: null }))).toBe("job.title");
    expect(problemOf(() => parseJob({ ...makeJob(1), notes: 5 }))).toBe("job.notes");
    expect(problemOf(() => parseJob({ ...makeJob(1), notes: null }))).toBe("job.notes");
  });

  test("rejects an unknown status or priority", () => {
    expect(problemOf(() => parseJob({ ...makeJob(1), status: "finished" }))).toBe("job.status");
    expect(problemOf(() => parseJob({ ...makeJob(1), status: "DONE" }))).toBe("job.status");
    expect(problemOf(() => parseJob({ ...makeJob(1), priority: "critical" }))).toBe("job.priority");
  });

  test("accepts every known status and priority", () => {
    for (const status of ["open", "in_progress", "done"]) expect(parseJob({ ...makeJob(1), status }).status).toBe(status);
    for (const priority of ["low", "normal", "urgent"]) expect(parseJob({ ...makeJob(1), priority }).priority).toBe(priority);
  });

  test("rejects a scheduledAt that is not a date", () => {
    expect(problemOf(() => parseJob({ ...makeJob(1), scheduledAt: "next tuesday" }))).toBe("job.scheduledAt");
    expect(problemOf(() => parseJob({ ...makeJob(1), scheduledAt: 1780000000 }))).toBe("job.scheduledAt");
  });
});

describe("parseJobPage", () => {
  test("accepts a page and a last page", () => {
    const items = [makeJob(1), makeJob(2)];
    expect(parseJobPage({ items, nextCursor: "abc" })).toEqual({ items, nextCursor: "abc" });
    expect(parseJobPage({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
  });

  test.each([null, [], "x", 1])("rejects %p as a page", (value) => {
    expect(problemOf(() => parseJobPage(value))).toBe("page");
  });

  test("rejects a missing or non-array items", () => {
    expect(problemOf(() => parseJobPage({ nextCursor: null }))).toBe("page.items");
    expect(problemOf(() => parseJobPage({ items: {}, nextCursor: null }))).toBe("page.items");
    expect(problemOf(() => parseJobPage({ jobs: [makeJob(1)], nextCursor: null }))).toBe("page.items");
  });

  test("rejects a missing, numeric or empty nextCursor", () => {
    expect(problemOf(() => parseJobPage({ items: [] }))).toBe("page.nextCursor");
    expect(problemOf(() => parseJobPage({ items: [], nextCursor: 10 }))).toBe("page.nextCursor");
    expect(problemOf(() => parseJobPage({ items: [], nextCursor: "" }))).toBe("page.nextCursor");
  });

  test("one bad item rejects the whole page and the path points at it", () => {
    const items = [makeJob(1), makeJob(2), { ...makeJob(3), customer: undefined }];
    expect(problemOf(() => parseJobPage({ items, nextCursor: null }))).toBe("page.items[2].customer");
  });
});
