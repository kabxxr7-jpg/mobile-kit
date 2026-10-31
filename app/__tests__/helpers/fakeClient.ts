import type { ApiClient } from "../../src/api/client";
import { ApiError } from "../../src/api/errors";
import type { Job, JobPage } from "../../src/api/types";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export type FakeClient = {
  [K in keyof ApiClient]: jest.MockedFunction<ApiClient[K]>;
};

/** A client whose three methods are jest mocks; tests decide what each call returns. */
export function createFakeClient(): FakeClient {
  return {
    listJobs: jest.fn<Promise<JobPage>, Parameters<ApiClient["listJobs"]>>(),
    getJob: jest.fn<Promise<Job>, Parameters<ApiClient["getJob"]>>(),
    setJobStatus: jest.fn<Promise<Job>, Parameters<ApiClient["setJobStatus"]>>(),
  };
}

/** A promise that settles like the real client would: rejects with an "aborted" ApiError when the signal fires. */
export function abortable<T>(source: Deferred<T>, signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new ApiError("aborted", "The request was cancelled"));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    source.promise.then(resolve, reject);
  });
}

export const httpError = (status: number): ApiError => new ApiError("http", `HTTP ${status}`, { status, retryable: status >= 500 || status === 429, attempts: 1 });
export const networkError = (): ApiError => new ApiError("network", "Network request failed", { retryable: true, attempts: 3 });
export const timeoutError = (): ApiError => new ApiError("timeout", "No answer within 8000 ms", { retryable: true, attempts: 3 });
export const validationError = (): ApiError => new ApiError("validation", "Unexpected response shape at page.items", { retryable: false });
