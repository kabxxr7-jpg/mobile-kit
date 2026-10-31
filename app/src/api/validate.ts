import { JOB_PRIORITIES, JOB_STATUSES, type Job, type JobPage, type JobPriority, type JobStatus } from "./types";

/** Thrown for any payload that is not the expected shape; the client turns it into an ApiError of kind "validation". */
export class ValidationError extends Error {
  readonly path: string;
  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`);
    this.name = "ValidationError";
    this.path = path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(record: Record<string, unknown>, key: string, path: string, opts: { allowEmpty?: boolean } = {}): string {
  const value = record[key];
  if (typeof value !== "string") throw new ValidationError(`${path}.${key}`, `expected a string, got ${describe(value)}`);
  if (!opts.allowEmpty && value.trim() === "") throw new ValidationError(`${path}.${key}`, "must not be empty");
  return value;
}

function oneOf<T extends string>(record: Record<string, unknown>, key: string, path: string, allowed: readonly T[]): T {
  const value = record[key];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${path}.${key}`, `expected one of ${allowed.join(", ")}, got ${describe(value)}`);
  }
  return value as T;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "string" ? `"${value.slice(0, 40)}"` : typeof value;
}

export function parseJob(value: unknown, path = "job"): Job {
  if (!isRecord(value)) throw new ValidationError(path, `expected an object, got ${describe(value)}`);
  const scheduledAt = str(value, "scheduledAt", path);
  if (!Number.isFinite(Date.parse(scheduledAt))) throw new ValidationError(`${path}.scheduledAt`, "not a valid date");
  const status: JobStatus = oneOf(value, "status", path, JOB_STATUSES);
  const priority: JobPriority = oneOf(value, "priority", path, JOB_PRIORITIES);
  // notes may be absent; anything else that is not a string is a bad payload
  const notes = value["notes"] === undefined ? "" : str(value, "notes", path, { allowEmpty: true });
  return {
    id: str(value, "id", path),
    title: str(value, "title", path),
    customer: str(value, "customer", path),
    address: str(value, "address", path),
    status,
    priority,
    scheduledAt,
    notes,
  };
}

export function parseJobPage(value: unknown): JobPage {
  if (!isRecord(value)) throw new ValidationError("page", `expected an object, got ${describe(value)}`);
  const items = value["items"];
  if (!Array.isArray(items)) throw new ValidationError("page.items", `expected an array, got ${describe(items)}`);
  const nextCursor = value["nextCursor"];
  if (nextCursor !== null && typeof nextCursor !== "string") {
    throw new ValidationError("page.nextCursor", `expected a string or null, got ${describe(nextCursor)}`);
  }
  if (typeof nextCursor === "string" && nextCursor === "") throw new ValidationError("page.nextCursor", "must not be an empty string");
  return { items: items.map((item, i) => parseJob(item, `page.items[${i}]`)), nextCursor };
}
