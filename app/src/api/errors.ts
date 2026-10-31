export type ApiErrorKind =
  /** fetch itself failed: no connection, DNS, refused, TLS. */
  | "network"
  /** The per-attempt time limit passed. */
  | "timeout"
  /** The server answered with a non-2xx status. */
  | "http"
  /** The server answered 2xx but the body is not JSON or not the shape we expect. */
  | "validation"
  /** The caller cancelled (unmount, refresh). Never shown to the user. */
  | "aborted";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  /** Would another attempt be sensible: network, timeout, 5xx and 429, never 4xx or a bad payload. */
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  /** How many attempts were made before giving up (set when the retry loop gives up). */
  readonly attempts: number;

  constructor(
    kind: ApiErrorKind,
    message: string,
    details: { status?: number; retryable?: boolean; retryAfterMs?: number; attempts?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = details.status;
    this.retryable = details.retryable ?? false;
    this.retryAfterMs = details.retryAfterMs;
    this.attempts = details.attempts ?? 1;
  }

  withAttempts(attempts: number): ApiError {
    const details: { status?: number; retryable: boolean; retryAfterMs?: number; attempts: number } = {
      retryable: this.retryable,
      attempts,
    };
    if (this.status !== undefined) details.status = this.status;
    if (this.retryAfterMs !== undefined) details.retryAfterMs = this.retryAfterMs;
    return new ApiError(this.kind, this.message, details);
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "aborted";
}

export interface ErrorDescription {
  title: string;
  message: string;
  /** True when the problem looks like connectivity (so the UI can say "offline?"). */
  offlineish: boolean;
}

/** User-facing wording. Server-supplied text is never shown. */
export function describeError(error: ApiError): ErrorDescription {
  switch (error.kind) {
    case "network":
      return { title: "You seem to be offline", message: "The app could not reach the server. Check your connection and try again.", offlineish: true };
    case "timeout":
      return { title: "The server is not answering", message: "The request took too long. Check your connection and try again.", offlineish: true };
    case "validation":
      return { title: "Unexpected response", message: "The server sent data this app does not understand, so nothing was shown.", offlineish: false };
    case "aborted":
      return { title: "Cancelled", message: "The request was cancelled.", offlineish: false };
    case "http":
      if (error.status === 429) return { title: "Too many requests", message: "The server asked the app to slow down. Wait a moment and try again.", offlineish: false };
      if (error.status === 404) return { title: "Not found", message: "This item does not exist any more.", offlineish: false };
      if (error.status !== undefined && error.status >= 500) return { title: "Server problem", message: "The server had an error. Try again in a moment.", offlineish: false };
      return { title: "Request rejected", message: `The server refused the request (status ${error.status ?? "unknown"}).`, offlineish: false };
  }
}
