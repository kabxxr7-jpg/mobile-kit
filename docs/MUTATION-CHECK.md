# Mutation check results

Snapshot of `npm run mutation-check` (59 mutants, each applied alone to a throwaway copy; the typecheck, the Jest suite and the Node suite run for each). KILLED means a test failed, SURVIVED means every test passed, TIMEOUT counts as not killed.

Killed 59 of 59 valid mutants; survived 0; timeout 0; invalid 0.

| Mutant | File | Breakage | Result | First failing test |
|---|---|---|---|---|
| client-retry-4xx | `app/src/api/client.ts` | retry every 4xx, not only 429 | KILLED | client.test.ts > retry does not retry a 400 |
| client-no-retry-429 | `app/src/api/client.ts` | stop retrying 429 | KILLED | client.test.ts > retry retries a 429 |
| client-no-retry-500 | `app/src/api/client.ts` | stop retrying a plain 500 (off by one in the status range) | KILLED | client.test.ts > retry retries a 500 and returns the later success |
| client-network-not-retryable | `app/src/api/client.ts` | network errors are no longer retried | KILLED | client.test.ts > retry retries a network error and then succeeds |
| client-timeout-not-retryable | `app/src/api/client.ts` | timeouts are no longer retried | KILLED | client.test.ts > timeout and abort a request that never answers times out with kind timeout and is retried |
| client-off-by-one-retries | `app/src/api/client.ts` | one attempt fewer than configured | KILLED | client.test.ts > retry gives up after 1 + maxRetries attempts and reports how many it made |
| client-extra-retry | `app/src/api/client.ts` | one attempt more than configured | KILLED | client.test.ts > retry gives up after 1 + maxRetries attempts and reports how many it made |
| client-validation-retryable | `app/src/api/client.ts` | a wrong-shaped payload is retried | KILLED | client.test.ts > retry a bad payload is never retried |
| client-bad-json-retryable | `app/src/api/client.ts` | a malformed JSON body is retried | KILLED | client.test.ts > response validation a 200 whose body is cut off is a validation error, not a crash |
| client-treat-4xx-as-ok | `app/src/api/client.ts` | only 5xx counts as an HTTP failure (4xx falls through to parsing) | KILLED | client.test.ts > retry retries a 429 |
| client-no-backoff-cap | `app/src/api/client.ts` | backoff step is no longer capped | KILLED | client.test.ts > backoff one step never exceeds retryMaxDelayMs |
| client-linear-backoff | `app/src/api/client.ts` | backoff grows linearly instead of doubling | KILLED | client.test.ts > backoff doubles each retry, with no jitter when random is 0 (half of the step) |
| client-ignore-retry-after | `app/src/api/client.ts` | Retry-After is ignored | KILLED | client.test.ts > backoff Retry-After on a 429 is waited for when it is longer than the backoff |
| client-retry-after-min | `app/src/api/client.ts` | a short Retry-After shortens the backoff | KILLED | client.test.ts > backoff Retry-After on a 429 is waited for when it is longer than the backoff |
| client-wait-forever-retry-after | `app/src/api/client.ts` | a very long Retry-After is waited for instead of returned | KILLED | client.test.ts > backoff a Retry-After longer than maxRetryAfterMs is not waited for: one attempt, error returned |
| client-timeout-flag-lost | `app/src/api/client.ts` | a timeout is reported as a plain network error | KILLED | client.test.ts > timeout and abort a request that never answers times out with kind timeout and is retried |
| client-timer-leak | `app/src/api/client.ts` | the per-attempt timer is never cleared | KILLED | client.test.ts > timeout and abort no timer is left running after success or failure |
| client-caller-abort-ignored | `app/src/api/client.ts` | aborting the caller's signal no longer cancels the fetch | KILLED | client.test.ts > timeout and abort aborting mid-flight rejects with kind aborted and does not retry |
| client-abort-retryable | `app/src/api/client.ts` | an aborted request is marked retryable | KILLED | client.test.ts > timeout and abort aborting mid-flight rejects with kind aborted and does not retry |
| client-write-uses-post | `app/src/api/client.ts` | mark-done sends POST instead of PATCH | KILLED | client.test.ts > requests setJobStatus sends a PATCH with a JSON body and returns the updated job |
| client-no-json-content-type | `app/src/api/client.ts` | the write is sent without a JSON content-type | KILLED | client.test.ts > requests setJobStatus sends a PATCH with a JSON body and returns the updated job |
| client-id-not-encoded | `app/src/api/client.ts` | the job id is not URL-encoded in getJob | KILLED | client.test.ts > requests getJob encodes the id |
| client-cursor-dropped | `app/src/api/client.ts` | the pagination cursor is never sent | KILLED | client.test.ts > requests listJobs puts cursor and limit in the query string, encoded |
| validate-any-enum-value | `app/src/api/validate.ts` | any string is accepted as a status or priority | KILLED | validate.test.ts > parseJob rejects an unknown status or priority |
| validate-blank-title-ok | `app/src/api/validate.ts` | a whitespace-only string counts as non-empty | KILLED | validate.test.ts > parseJob rejects an empty or blank id |
| validate-skip-date-check | `app/src/api/validate.ts` | scheduledAt is not checked to be a date | KILLED | validate.test.ts > parseJob rejects a scheduledAt that is not a date |
| validate-notes-any-type | `app/src/api/validate.ts` | a non-string notes value is silently replaced by an empty string | KILLED | validate.test.ts > parseJob rejects wrong types |
| validate-cursor-undefined-ok | `app/src/api/validate.ts` | a missing nextCursor is accepted | KILLED | validate.test.ts > parseJobPage rejects a missing, numeric or empty nextCursor |
| validate-items-unchecked | `app/src/api/validate.ts` | items is not checked to be an array | KILLED | validate.test.ts > parseJobPage rejects a missing or non-array items |
| config-allow-credentials | `app/src/api/config.ts` | a base URL with user:password@ is accepted | KILLED | config.test.ts > resolveBaseUrl refuses a URL with embedded credentials, since the bundle is readable by anyone |
| config-extra-before-env | `app/src/api/config.ts` | app.json wins over the environment variable | KILLED | config.test.ts > resolveBaseUrl the environment variable wins over app.json extra |
| errors-429-wording | `app/src/api/errors.ts` | a 429 is described as a generic rejection | KILLED | list-screen.test.tsx > error a 429 shows an error state with its own wording and a Retry button, not a blank screen |
| format-time-slice | `app/src/components/format.ts` | the scheduled time shows seconds | KILLED | list-screen.test.tsx > loading each row is a labelled button that says what the job is |
| list-failed-refresh-wipes-list | `app/src/state/useJobList.ts` | a failed refresh replaces the old list with the error screen | KILLED | list-screen.test.tsx > pull to refresh a failed refresh keeps the old list and says it may be offline; Try again recovers |
| list-stale-banner-sticks | `app/src/state/useJobList.ts` | the stale-data banner is not cleared when a new refresh starts | KILLED | list-screen.test.tsx > pull to refresh a failed refresh keeps the old list and says it may be offline; Try again recovers |
| list-no-dedupe | `app/src/state/useJobList.ts` | a job that appears on two pages is listed twice | KILLED | list-screen.test.tsx > pagination a job that appears on two pages is shown once |
| list-more-error-retries-itself | `app/src/state/useJobList.ts` | reaching the end retries a failed page by itself | KILLED | list-screen.test.tsx > pagination a failed next page keeps page 1, offers Retry, and does not retry by itself |
| list-double-load-more | `app/src/state/useJobList.ts` | reaching the end while a page is loading sends a second request | KILLED | list-screen.test.tsx > pagination reaching the end twice while a page is loading sends one request |
| list-no-abort-on-unmount | `app/src/state/useJobList.ts` | leaving the screen does not cancel the request | KILLED | list-screen.test.tsx > leaving the screen unmounting cancels the request that is still running and a late answer does no harm |
| list-stale-answer-applied | `app/src/state/useJobList.ts` | an answer from a superseded refresh is applied | KILLED | list-screen.test.tsx > pull to refresh an answer from a client that ignores the abort signal is still dropped when a newer refresh won |
| list-refresh-keeps-old-request | `app/src/state/useJobList.ts` | a new refresh does not cancel the one still running | KILLED | list-screen.test.tsx > pull to refresh a second pull while the first is running cancels the first and ignores its late answer |
| list-page-size | `app/src/state/useJobList.ts` | the page size changes from 10 to 20 | KILLED | list-screen.test.tsx > loading asks for the first page with a limit of 10 and no cursor |
| screen-error-state-skipped | `app/src/screens/JobListScreen.tsx` | a failed first load shows the empty state instead of the error | KILLED | list-screen.test.tsx > error a 500 shows an error state with its own wording and a Retry button, not a blank screen |
| screen-empty-state-skipped | `app/src/screens/JobListScreen.tsx` | an empty list renders a blank list instead of the empty state | KILLED | layout.test.tsx > with a valid client the app starts on the list screen |
| screen-retry-does-refresh | `app/src/screens/JobListScreen.tsx` | Retry on the error screen refreshes silently instead of showing loading | KILLED | list-screen.test.tsx > error Retry goes back to loading, then shows the list when the server has recovered |
| screen-retry-label-lost | `app/src/screens/JobListScreen.tsx` | the Retry button loses its accessibility label | KILLED | list-screen.test.tsx > error a 500 shows an error state with its own wording and a Retry button, not a blank screen |
| screen-never-says-offline | `app/src/screens/JobListScreen.tsx` | the stale banner never mentions being offline | KILLED | list-screen.test.tsx > pull to refresh a failed refresh keeps the old list and says it may be offline; Try again recovers |
| screen-refresh-not-wired | `app/src/screens/JobListScreen.tsx` | pull to refresh calls nothing | KILLED | detail-screen.test.tsx > mark done (optimistic write) a refresh that lands while the write is in flight does not undo the optimistic change |
| cache-rollback-keeps-done | `app/src/state/JobsCache.tsx` | a failed write is not rolled back | KILLED | jobs-cache.test.tsx > markDone on failure the job is exactly the object that was passed in, and the failure is recorded |
| cache-no-optimistic-update | `app/src/state/JobsCache.tsx` | the job only changes after the server answers | KILLED | jobs-cache.test.tsx > markDone changes the job at once, and keeps the server's version once it answers |
| cache-refresh-clobbers-write | `app/src/state/JobsCache.tsx` | a refresh overwrites a job whose write is still in flight | KILLED | jobs-cache.test.tsx > upsertMany leaves a job alone while its write is in flight, but still updates the others |
| cache-allows-double-write | `app/src/state/JobsCache.tsx` | a second write for the same job can start while one is running | KILLED | jobs-cache.test.tsx > markDone a second call for the same job while the first is running does nothing |
| cache-failure-silent | `app/src/state/JobsCache.tsx` | a rolled-back write leaves no message | KILLED | jobs-cache.test.tsx > markDone on failure the job is exactly the object that was passed in, and the failure is recorded |
| cache-no-abort-on-unmount | `app/src/state/JobsCache.tsx` | closing the app does not cancel a running write | KILLED | detail-screen.test.tsx > mark done (optimistic write) closing the whole app cancels a write that is still running |
| detail-busy-state-lost | `app/src/screens/JobDetailScreen.tsx` | the button does not report busy while saving | KILLED | detail-screen.test.tsx > mark done (optimistic write) shows Done at once, in the detail and in the list, then keeps it once the server confirms |
| detail-404-offers-retry | `app/src/screens/JobDetailScreen.tsx` | a 404 offers a Retry button | KILLED | detail-screen.test.tsx > opening a job that is not in the list (a link, or the list failed) a 404 says the job does not exist and offers no useless Retry |
| detail-refetches-cached-job | `app/src/state/useJob.ts` | a job already in the list is fetched again | KILLED | list-screen.test.tsx > navigation pressing a row opens that job |
| detail-no-abort-on-leave | `app/src/state/useJob.ts` | leaving the detail screen does not cancel its request | KILLED | detail-screen.test.tsx > opening a job that is not in the list (a link, or the list failed) leaving before the answer cancels the request |
| layout-swallows-all-errors | `app/src/app/_layout.tsx` | any startup error is shown as a configuration problem | KILLED | layout.test.tsx > an unexpected error while creating the client is not swallowed |
