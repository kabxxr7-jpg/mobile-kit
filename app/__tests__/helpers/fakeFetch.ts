// A scriptable fake for the global fetch. Each call consumes the next step.
export type Step =
  | { json: unknown; status?: number; headers?: Record<string, string> }
  | { text: string; status?: number; headers?: Record<string, string> }
  | { throws: Error }
  /** Never answers; rejects with an AbortError-like error when the request is aborted. */
  | { hang: true }
  /** Answers the headers at once, but the body never arrives until the request is aborted. */
  | { hangBody: true; status?: number };

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  signal: AbortSignal | undefined;
}

export function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

export function createFakeFetch(steps: Step[]): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const fake = (input: unknown, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal ?? undefined;
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      body: typeof init?.body === "string" ? init.body : undefined,
      signal,
    });
    const step = steps[Math.min(index, steps.length - 1)];
    index += 1;
    if (!step) return Promise.reject(new Error("fake fetch: no steps"));
    if ("throws" in step) return Promise.reject(step.throws);
    const rejectOnAbort = <T,>(): Promise<T> =>
      new Promise<T>((_, reject) => {
        if (signal?.aborted) return reject(abortError());
        signal?.addEventListener("abort", () => reject(abortError()), { once: true });
      });
    if ("hang" in step) return rejectOnAbort<Response>();
    if ("hangBody" in step) {
      const response = new Response("", { status: step.status ?? 200 });
      Object.defineProperty(response, "text", { value: () => rejectOnAbort<string>() });
      return Promise.resolve(response);
    }
    const body = "json" in step ? JSON.stringify(step.json) : step.text;
    return Promise.resolve(new Response(body, { status: step.status ?? 200, headers: step.headers ?? {} }));
  };
  return { fetch: fake as unknown as typeof fetch, calls };
}
