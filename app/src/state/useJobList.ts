import { useCallback, useEffect, useReducer, useRef } from "react";
import { useApiClient } from "../api/ApiProvider";
import { ApiError, isAbortError } from "../api/errors";
import { useJobsCache } from "./JobsCache";

export const PAGE_SIZE = 10;

export interface ListState {
  /** loading: first load, nothing to show yet. error: nothing to show and the load failed. ready: list (possibly empty) is shown. */
  phase: "loading" | "ready" | "error";
  ids: string[];
  nextCursor: string | null;
  /** The last load or refresh failure. In phase "ready" it is shown as a banner above the old list. */
  error: ApiError | null;
  refreshing: boolean;
  loadingMore: boolean;
  moreError: ApiError | null;
}

type Action =
  | { type: "load-start" }
  | { type: "refresh-start" }
  | { type: "load-success"; ids: string[]; nextCursor: string | null }
  | { type: "load-error"; error: ApiError }
  | { type: "more-start" }
  | { type: "more-success"; ids: string[]; nextCursor: string | null }
  | { type: "more-error"; error: ApiError };

export const initialListState: ListState = { phase: "loading", ids: [], nextCursor: null, error: null, refreshing: false, loadingMore: false, moreError: null };

export function listReducer(state: ListState, action: Action): ListState {
  switch (action.type) {
    case "load-start":
      return initialListState;
    case "refresh-start":
      return { ...state, refreshing: true, error: null, loadingMore: false, moreError: null };
    case "load-success":
      return { phase: "ready", ids: action.ids, nextCursor: action.nextCursor, error: null, refreshing: false, loadingMore: false, moreError: null };
    case "load-error":
      // With something already on screen keep showing it and just report the failure.
      return { ...state, phase: state.ids.length > 0 ? "ready" : "error", error: action.error, refreshing: false };
    case "more-start":
      return { ...state, loadingMore: true, moreError: null };
    case "more-success": {
      const known = new Set(state.ids);
      return { ...state, ids: [...state.ids, ...action.ids.filter((id) => !known.has(id))], nextCursor: action.nextCursor, loadingMore: false, moreError: null };
    }
    case "more-error":
      return { ...state, loadingMore: false, moreError: action.error };
  }
}

function asApiError(cause: unknown): ApiError {
  return cause instanceof ApiError ? cause : new ApiError("network", cause instanceof Error ? cause.message : "unknown failure");
}

export function useJobList() {
  const client = useApiClient();
  const cache = useJobsCache();
  const [state, dispatch] = useReducer(listReducer, initialListState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  /** First load and pull to refresh. Starting one cancels whatever list request is still running. */
  const load = useCallback(
    (kind: "initial" | "refresh") => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const generation = ++generationRef.current;
      dispatch({ type: kind === "initial" ? "load-start" : "refresh-start" });
      client.listJobs({ limit: PAGE_SIZE }, { signal: controller.signal }).then(
        (page) => {
          if (generation !== generationRef.current) return;
          cache.upsertMany(page.items);
          dispatch({ type: "load-success", ids: page.items.map((job) => job.id), nextCursor: page.nextCursor });
        },
        (cause: unknown) => {
          if (generation !== generationRef.current || isAbortError(cause)) return;
          dispatch({ type: "load-error", error: asApiError(cause) });
        },
      );
    },
    [client, cache],
  );

  const loadMore = useCallback(
    (options: { force?: boolean } = {}) => {
      const current = stateRef.current;
      const cursor = current.nextCursor;
      if (current.phase !== "ready" || cursor === null || current.loadingMore || current.refreshing) return;
      // After a failure the footer offers a Retry button; reaching the end of the list must not hammer a failing server.
      if (current.moreError && !options.force) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      const generation = generationRef.current;
      dispatch({ type: "more-start" });
      client.listJobs({ cursor, limit: PAGE_SIZE }, { signal: controller.signal }).then(
        (page) => {
          if (generation !== generationRef.current) return;
          cache.upsertMany(page.items);
          dispatch({ type: "more-success", ids: page.items.map((job) => job.id), nextCursor: page.nextCursor });
        },
        (cause: unknown) => {
          if (generation !== generationRef.current || isAbortError(cause)) return;
          dispatch({ type: "more-error", error: asApiError(cause) });
        },
      );
    },
    [client, cache],
  );

  useEffect(() => {
    load("initial");
    return () => {
      // Leaving the screen: cancel the request and make any late answer a no-op.
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => load("initial"), [load]);
  const refresh = useCallback(() => load("refresh"), [load]);
  const retryMore = useCallback(() => loadMore({ force: true }), [loadMore]);
  return { state, reload, refresh, loadMore, retryMore };
}
