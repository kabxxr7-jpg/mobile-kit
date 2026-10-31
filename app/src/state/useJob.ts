import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "../api/ApiProvider";
import { ApiError, isAbortError } from "../api/errors";
import type { Job } from "../api/types";
import { useJobsCache } from "./JobsCache";

export interface JobView {
  job: Job | undefined;
  phase: "loading" | "ready" | "error";
  error: ApiError | null;
  retry(): void;
}

/** A single job: taken from the cache when the list already loaded it, fetched otherwise (for example when opened by a link). */
export function useJob(id: string): JobView {
  const client = useApiClient();
  const cache = useJobsCache();
  const job = cache.byId[id];
  const hasJobRef = useRef(job !== undefined);
  hasJobRef.current = job !== undefined;
  const [fetchState, setFetchState] = useState<{ loading: boolean; error: ApiError | null }>({ loading: job === undefined, error: null });
  const controllerRef = useRef<AbortController | null>(null);
  const { upsertMany } = cache;

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFetchState({ loading: true, error: null });
    client.getJob(id, { signal: controller.signal }).then(
      (fetched) => {
        if (controller.signal.aborted) return;
        upsertMany([fetched]);
        setFetchState({ loading: false, error: null });
      },
      (cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        const error = cause instanceof ApiError ? cause : new ApiError("network", cause instanceof Error ? cause.message : "unknown failure");
        setFetchState({ loading: false, error });
      },
    );
  }, [client, id, upsertMany]);

  useEffect(() => {
    if (!hasJobRef.current) load();
    return () => controllerRef.current?.abort();
  }, [load]);

  if (job) return { job, phase: "ready", error: null, retry: load };
  if (fetchState.error) return { job: undefined, phase: "error", error: fetchState.error, retry: load };
  return { job: undefined, phase: "loading", error: null, retry: load };
}
