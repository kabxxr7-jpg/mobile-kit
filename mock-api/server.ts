// A tiny fictional "Field Service Jobs" REST API for exercising every screen state of the app.
// Plain node:http, no dependencies, deterministic data, switchable failure modes.
//
//   GET   /health
//   GET   /jobs?cursor=&limit=     -> { items: Job[], nextCursor: string | null }
//   GET   /jobs/:id                -> Job
//   PATCH /jobs/:id  {"status":..} -> Job
//
// Control endpoints (for tests and manual runs; not part of the "real" API):
//   GET  /__admin/state            -> current mode, request counters, jobs marked done
//   POST /__admin/mode  {mode, scope?, times?, delayMs?, retryAfterSeconds?}
//   POST /__admin/reset            -> data, mode and counters back to the start
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const STATUSES = ["open", "in_progress", "done"] as const;
export const PRIORITIES = ["low", "normal", "urgent"] as const;
export type JobStatus = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface Job {
  id: string;
  title: string;
  customer: string;
  address: string;
  status: JobStatus;
  priority: Priority;
  scheduledAt: string;
  notes: string;
}

export const MODES = ["normal", "slow", "error500", "rate-limit", "malformed-json", "empty", "wrong-schema"] as const;
export type Mode = (typeof MODES)[number];
export const SCOPES = ["all", "read", "write"] as const;
export type Scope = (typeof SCOPES)[number];

export interface ModeConfig {
  mode: Mode;
  /** Which requests the mode applies to: GET (read), PATCH (write) or both. */
  scope: Scope;
  /** Number of matching requests still affected; null means until changed. After the last one the mode returns to normal. */
  remaining: number | null;
  delayMs: number;
  retryAfterSeconds: number;
}

export const TOTAL_JOBS = 23;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

const CUSTOMERS = ["Harbour Bakery", "Northgate Dental", "Willow Court Flats", "Pinecrest School", "Marlow Garage", "Brindle Cove Library"];
const TASKS = ["Replace boiler pressure valve", "Inspect fire alarm panel", "Fix leaking tap in kitchenette", "Service air conditioning unit", "Rewire emergency light", "Unblock floor drain", "Replace door closer"];
const STREETS = ["Harbour Lane", "Mill Road", "Orchard Row", "Quarry Street", "Lantern Walk"];
const NOTES = ["", "Key is with the front desk.", "Call the site contact 30 minutes before arriving.", "Parking at the rear only.", ""];

/** The same 23 jobs every time. All names, addresses and customers are fictional. */
export function buildJobs(): Job[] {
  const jobs: Job[] = [];
  const base = Date.parse("2026-06-01T08:00:00.000Z");
  for (let i = 0; i < TOTAL_JOBS; i++) {
    const n = i + 1;
    jobs.push({
      id: `job-${String(n).padStart(3, "0")}`,
      title: TASKS[i % TASKS.length] ?? "Site visit",
      customer: CUSTOMERS[i % CUSTOMERS.length] ?? "Customer",
      address: `${10 + ((i * 7) % 80)} ${STREETS[i % STREETS.length] ?? "Main Street"}, Brindle Cove`,
      status: i % 6 === 5 ? "done" : i % 3 === 1 ? "in_progress" : "open",
      priority: i % 7 === 0 ? "urgent" : i % 2 === 0 ? "normal" : "low",
      scheduledAt: new Date(base + i * 3 * 60 * 60 * 1000).toISOString(),
      notes: NOTES[i % NOTES.length] ?? "",
    });
  }
  return jobs;
}

export interface MockApiState {
  config: ModeConfig;
  /** Data requests seen since the last reset (control and /health requests are not counted). */
  requests: number;
  /** Data requests that were answered with a failure mode applied. */
  affected: number;
  jobs: Job[];
}

export interface MockApi {
  server: Server;
  state: MockApiState;
  listen(port?: number, host?: string): Promise<{ port: number; url: string }>;
  close(): Promise<void>;
}

function defaultConfig(): ModeConfig {
  return { mode: "normal", scope: "all", remaining: null, delayMs: 5000, retryAfterSeconds: 1 };
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(text);
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

function readBody(req: IncomingMessage, limit = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk); // keep draining an oversized body so the 413 can be delivered
    });
    req.on("end", () => (size > limit ? reject(new Error("body_too_large")) : resolve(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString("base64url");
}

function decodeCursor(cursor: string): number | null {
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  const match = /^offset:(\d{1,6})$/.exec(text);
  return match ? Number(match[1]) : null;
}

export function createMockApi(): MockApi {
  const state: MockApiState = { config: defaultConfig(), requests: 0, affected: 0, jobs: buildJobs() };

  function reset(): void {
    state.config = defaultConfig();
    state.requests = 0;
    state.affected = 0;
    state.jobs = buildJobs();
  }

  /** Returns the mode that applies to this data request, and consumes one use of it. */
  function takeMode(isWrite: boolean): Mode {
    state.requests += 1;
    const { config } = state;
    if (config.mode === "normal") return "normal";
    if (config.scope === "read" && isWrite) return "normal";
    if (config.scope === "write" && !isWrite) return "normal";
    const mode = config.mode;
    state.affected += 1;
    if (config.remaining !== null) {
      config.remaining -= 1;
      if (config.remaining <= 0) state.config = defaultConfig();
    }
    return mode;
  }

  const delayOf = (): number => state.config.delayMs;
  const retryAfterOf = (): number => state.config.retryAfterSeconds;

  async function handleAdmin(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (path === "/__admin/state" && req.method === "GET") {
      sendJson(res, 200, {
        config: state.config,
        requests: state.requests,
        affected: state.affected,
        done: state.jobs.filter((j) => j.status === "done").map((j) => j.id),
      });
      return;
    }
    if (path === "/__admin/reset" && req.method === "POST") {
      reset();
      sendJson(res, 200, { ok: true });
      return;
    }
    if (path === "/__admin/mode" && req.method === "POST") {
      const body = parseJsonObject(await readBody(req));
      if (!body) return sendJson(res, 400, { error: "body must be a JSON object" });
      const mode = body["mode"];
      if (typeof mode !== "string" || !(MODES as readonly string[]).includes(mode)) {
        return sendJson(res, 400, { error: `mode must be one of ${MODES.join(", ")}` });
      }
      const scope = body["scope"] ?? "all";
      if (typeof scope !== "string" || !(SCOPES as readonly string[]).includes(scope)) {
        return sendJson(res, 400, { error: `scope must be one of ${SCOPES.join(", ")}` });
      }
      const next = defaultConfig();
      next.mode = mode as Mode;
      next.scope = scope as Scope;
      for (const [key, field] of [["times", "remaining"], ["delayMs", "delayMs"], ["retryAfterSeconds", "retryAfterSeconds"]] as const) {
        const value = body[key];
        if (value === undefined) continue;
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 600_000) {
          return sendJson(res, 400, { error: `${key} must be a non-negative integer` });
        }
        if (field === "remaining" && value === 0) return sendJson(res, 400, { error: "times must be at least 1" });
        next[field] = value;
      }
      state.config = next;
      sendJson(res, 200, { ok: true, config: state.config });
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  }

  async function handleData(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? "GET";
    const isWrite = method !== "GET";
    const path = url.pathname;
    const listRoute = path === "/jobs";
    const itemMatch = /^\/jobs\/([^/]+)$/.exec(path);
    if (!listRoute && !itemMatch) return sendJson(res, 404, { error: "not_found" });
    if (listRoute && method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
    if (itemMatch && method !== "GET" && method !== "PATCH") return sendJson(res, 405, { error: "method_not_allowed" });

    const mode = takeMode(isWrite);
    if (mode === "slow") {
      const delay = delayOf();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        res.on("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (res.destroyed || res.writableEnded) return;
    }
    if (mode === "error500") return sendJson(res, 500, { error: "internal_error" });
    if (mode === "rate-limit") return sendJson(res, 429, { error: "rate_limited" }, { "retry-after": String(retryAfterOf()) });
    if (mode === "malformed-json") return sendText(res, 200, '{"items":[{"id":"job-001","title":"Replace boil');
    if (mode === "wrong-schema") {
      if (listRoute) return sendJson(res, 200, { jobs: [{ id: 1, name: "Replace boiler pressure valve" }] });
      return sendJson(res, 200, { id: 7, title: null });
    }

    if (listRoute) {
      if (mode === "empty") return sendJson(res, 200, { items: [], nextCursor: null });
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        return sendJson(res, 400, { error: `limit must be an integer from 1 to ${MAX_PAGE_SIZE}` });
      }
      const rawCursor = url.searchParams.get("cursor");
      const offset = rawCursor === null || rawCursor === "" ? 0 : decodeCursor(rawCursor);
      if (offset === null) return sendJson(res, 400, { error: "invalid cursor" });
      const items = state.jobs.slice(offset, offset + limit);
      const next = offset + limit;
      return sendJson(res, 200, { items, nextCursor: next < state.jobs.length ? encodeCursor(next) : null });
    }

    const id = decodeURIComponent(itemMatch?.[1] ?? "");
    const job = state.jobs.find((j) => j.id === id);
    if (!job) return sendJson(res, 404, { error: "job_not_found" });
    if (method === "GET") return sendJson(res, 200, job);

    let text: string;
    try {
      text = await readBody(req);
    } catch {
      return sendJson(res, 413, { error: "body_too_large" });
    }
    const body = parseJsonObject(text);
    const status = body?.["status"];
    if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
      return sendJson(res, 400, { error: `status must be one of ${STATUSES.join(", ")}` });
    }
    job.status = status as JobStatus;
    return sendJson(res, 200, job);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock.local");
    const run = async (): Promise<void> => {
      if (url.pathname === "/health") return sendJson(res, 200, { ok: true });
      if (url.pathname.startsWith("/__admin/")) return handleAdmin(req, res, url.pathname);
      return handleData(req, res, url);
    };
    run().catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "mock_api_bug" });
      else res.destroy();
    });
  });

  return {
    server,
    state,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          const address = server.address() as AddressInfo;
          resolve({ port: address.port, url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${address.port}` });
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
