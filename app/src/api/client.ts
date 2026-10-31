import { ApiError } from "./errors";
import type { Job, JobPage, JobStatus } from "./types";
import { ValidationError, parseJob, parseJobPage } from "./validate";

export interface ApiClientOptions {
  baseUrl: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Time limit for ONE attempt, including reading the body. Default 8000. */
  timeoutMs?: number;
  /** Extra attempts after the first for 5xx, 429, timeouts and network errors. Default 2 (so 3 attempts). Never used for other 4xx or bad payloads. */
  maxRetries?: number;
  /** First backoff step; doubles each retry. Default 400. */
  retryBaseDelayMs?: number;
  /** Upper limit for one backoff step. Default 4000. */
  retryMaxDelayMs?: number;
  /** A Retry-After longer than this is not waited for: the error is returned at once. Default 10000. */
  maxRetryAfterMs?: number;
  /** Injectable for tests. Must reject with an "aborted" ApiError when the signal fires. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Injectable for tests; returns [0, 1). Used for jitter. */
  random?: () => number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  listJobs(params?: { cursor?: string | null; limit?: number }, options?: RequestOptions): Promise<JobPage>;
  getJob(id: string, options?: RequestOptions): Promise<Job>;
  /** PATCH /jobs/:id {status}. Setting a status is idempotent, which is why it is safe to retry. */
  setJobStatus(id: string, status: JobStatus, options?: RequestOptions): Promise<Job>;
}

const abortedError = (): ApiError => new ApiError("aborted", "The request was cancelled", { retryable: false });

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortedError());
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Retry-After as seconds ("3") or an HTTP date. Returns milliseconds, or undefined if absent or unusable. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return undefined;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRetries = options.maxRetries ?? 2;
  const baseDelay = options.retryBaseDelayMs ?? 400;
  const maxDelay = options.retryMaxDelayMs ?? 4000;
  const maxRetryAfter = options.maxRetryAfterMs ?? 10_000;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  /** Exponential backoff with "equal jitter": half fixed, half random. */
  function backoffDelay(attempt: number): number {
    const step = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
    return Math.round(step / 2 + random() * (step / 2));
  }

  async function attemptOnce<T>(method: string, path: string, body: unknown, parse: (json: unknown) => T, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortedError();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    /** Decides what a failure of fetch or of reading the body means. */
    const classify = (cause: unknown): ApiError => {
      if (signal?.aborted) return abortedError();
      if (timedOut) return new ApiError("timeout", `No answer within ${timeoutMs} ms`, { retryable: true });
      const reason = cause instanceof Error ? cause.message : "unknown";
      return new ApiError("network", `Network request failed (${reason})`, { retryable: true });
    };

    try {
      const headers: Record<string, string> = { accept: "application/json" };
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(body);
      }

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, init);
      } catch (cause) {
        throw classify(cause);
      }

      if (!response.ok) {
        const status = response.status;
        const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        const retryable = status >= 500 || status === 429;
        throw new ApiError("http", `HTTP ${status}`, retryAfterMs === undefined ? { status, retryable } : { status, retryable, retryAfterMs });
      }

      let text: string;
      try {
        text = await response.text();
      } catch (cause) {
        throw classify(cause);
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ApiError("validation", "The response body is not valid JSON", { retryable: false });
      }
      try {
        return parse(json);
      } catch (cause) {
        if (cause instanceof ValidationError) throw new ApiError("validation", `Unexpected response shape at ${cause.message}`, { retryable: false });
        throw cause;
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async function request<T>(method: string, path: string, body: unknown, parse: (json: unknown) => T, signal?: AbortSignal): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await attemptOnce(method, path, body, parse, signal);
      } catch (cause) {
        if (!(cause instanceof ApiError)) throw cause;
        const tooLongToWait = cause.retryAfterMs !== undefined && cause.retryAfterMs > maxRetryAfter;
        if (!cause.retryable || attempt > maxRetries || tooLongToWait) throw cause.withAttempts(attempt);
        const wait = Math.max(backoffDelay(attempt), cause.retryAfterMs ?? 0);
        try {
          await sleep(wait, signal);
        } catch {
          throw abortedError().withAttempts(attempt);
        }
      }
    }
  }

  return {
    listJobs(params = {}, requestOptions = {}) {
      const query: string[] = [];
      if (params.cursor) query.push(`cursor=${encodeURIComponent(params.cursor)}`);
      if (params.limit !== undefined) query.push(`limit=${encodeURIComponent(String(params.limit))}`);
      const path = query.length > 0 ? `/jobs?${query.join("&")}` : "/jobs";
      return request("GET", path, undefined, parseJobPage, requestOptions.signal);
    },
    getJob(id, requestOptions = {}) {
      return request("GET", `/jobs/${encodeURIComponent(id)}`, undefined, (json) => parseJob(json), requestOptions.signal);
    },
    setJobStatus(id, status, requestOptions = {}) {
      return request("PATCH", `/jobs/${encodeURIComponent(id)}`, { status }, (json) => parseJob(json), requestOptions.signal);
    },
  };
}
