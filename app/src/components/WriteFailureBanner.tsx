import { describeError } from "../api/errors";
import { useJobsCache } from "../state/JobsCache";
import { Banner } from "./Banner";

/** Shown on the list and the detail screen after an optimistic write failed and was rolled back. */
export function WriteFailureBanner() {
  const { writeFailure, clearWriteFailure } = useJobsCache();
  if (!writeFailure) return null;
  const info = describeError(writeFailure.error);
  return <Banner testID="write-failure-banner" tone="danger" message={`Could not mark "${writeFailure.jobTitle}" as done, so it was changed back. ${info.message}`} onDismiss={clearWriteFailure} />;
}
