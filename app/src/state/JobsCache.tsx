import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { useApiClient } from "../api/ApiProvider";
import { ApiError, isAbortError } from "../api/errors";
import type { Job } from "../api/types";

export interface WriteFailure {
  jobId: string;
  jobTitle: string;
  error: ApiError;
}

interface CacheState {
  byId: Record<string, Job>;
  pending: Record<string, true>;
  writeFailure: WriteFailure | null;
}

type Action =
  | { type: "upsert-many"; jobs: Job[] }
  | { type: "optimistic"; job: Job }
  | { type: "confirmed"; job: Job }
  | { type: "rolled-back"; previous: Job; failure: WriteFailure }
  | { type: "clear-failure" };

function withoutKey(record: Record<string, true>, key: string): Record<string, true> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function reducer(state: CacheState, action: Action): CacheState {
  switch (action.type) {
    case "upsert-many": {
      if (action.jobs.length === 0) return state;
      const byId = { ...state.byId };
      for (const job of action.jobs) byId[job.id] = job;
      return { ...state, byId };
    }
    case "optimistic":
      return { ...state, byId: { ...state.byId, [action.job.id]: action.job }, pending: { ...state.pending, [action.job.id]: true }, writeFailure: null };
    case "confirmed":
      return { ...state, byId: { ...state.byId, [action.job.id]: action.job }, pending: withoutKey(state.pending, action.job.id) };
    case "rolled-back":
      return { ...state, byId: { ...state.byId, [action.previous.id]: action.previous }, pending: withoutKey(state.pending, action.previous.id), writeFailure: action.failure };
    case "clear-failure":
      return { ...state, writeFailure: null };
  }
}

export interface JobsCache {
  byId: Record<string, Job>;
  /** Job ids with a write in flight. */
  pending: Record<string, true>;
  /** The last write that failed and was rolled back; null once dismissed or after the next write starts. */
  writeFailure: WriteFailure | null;
  upsertMany(jobs: Job[]): void;
  /**
   * Optimistic "mark done": the job shows as done at once, the PATCH goes out, and on failure the job goes back to
   * the exact object the caller passed in. Resolves true if the server confirmed it.
   */
  markDone(job: Job): Promise<boolean>;
  clearWriteFailure(): void;
}

const CacheContext = createContext<JobsCache | null>(null);

export function JobsCacheProvider({ children }: { children: ReactNode }) {
  const client = useApiClient();
  const [state, dispatch] = useReducer(reducer, { byId: {}, pending: {}, writeFailure: null });
  const inFlight = useRef(new Map<string, AbortController>());

  // A write started from a screen that is later closed must still finish; only unmounting the whole provider cancels.
  useEffect(() => {
    const controllers = inFlight.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  const upsertMany = useCallback((jobs: Job[]) => {
    // A refresh must not overwrite the optimistic copy of a job whose write is still in flight.
    dispatch({ type: "upsert-many", jobs: jobs.filter((job) => !inFlight.current.has(job.id)) });
  }, []);

  const markDone = useCallback(
    async (job: Job): Promise<boolean> => {
      if (job.status === "done" || inFlight.current.has(job.id)) return false;
      const controller = new AbortController();
      inFlight.current.set(job.id, controller);
      dispatch({ type: "optimistic", job: { ...job, status: "done" } });
      try {
        const updated = await client.setJobStatus(job.id, "done", { signal: controller.signal });
        inFlight.current.delete(job.id);
        dispatch({ type: "confirmed", job: updated });
        return true;
      } catch (cause) {
        inFlight.current.delete(job.id);
        if (isAbortError(cause)) return false;
        const error = cause instanceof ApiError ? cause : new ApiError("network", cause instanceof Error ? cause.message : "unknown");
        dispatch({ type: "rolled-back", previous: job, failure: { jobId: job.id, jobTitle: job.title, error } });
        return false;
      }
    },
    [client],
  );

  const clearWriteFailure = useCallback(() => dispatch({ type: "clear-failure" }), []);

  const value = useMemo<JobsCache>(
    () => ({ byId: state.byId, pending: state.pending, writeFailure: state.writeFailure, upsertMany, markDone, clearWriteFailure }),
    [state, upsertMany, markDone, clearWriteFailure],
  );
  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
}

export function useJobsCache(): JobsCache {
  const cache = useContext(CacheContext);
  if (!cache) throw new Error("useJobsCache must be used inside <JobsCacheProvider>");
  return cache;
}
