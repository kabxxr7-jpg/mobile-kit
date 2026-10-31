import type { Job, JobPage } from "../../src/api/types";

export function makeJob(n: number, overrides: Partial<Job> = {}): Job {
  const id = `job-${String(n).padStart(3, "0")}`;
  return {
    id,
    title: `Replace valve ${n}`,
    customer: `Harbour Bakery ${n}`,
    address: `${n} Harbour Lane, Brindle Cove`,
    status: "open",
    priority: "normal",
    scheduledAt: "2026-06-01T08:00:00.000Z",
    notes: "",
    ...overrides,
  };
}

export function makePage(from: number, count: number, nextCursor: string | null): JobPage {
  return { items: Array.from({ length: count }, (_, i) => makeJob(from + i)), nextCursor };
}
