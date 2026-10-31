import type { JobPriority, JobStatus } from "../api/types";

export const STATUS_LABEL: Record<JobStatus, string> = { open: "Open", in_progress: "In progress", done: "Done" };
export const PRIORITY_LABEL: Record<JobPriority, string> = { low: "Low", normal: "Normal", urgent: "Urgent" };

/** "2026-06-01 08:00 UTC". Fixed format and zone so the screen (and its tests) do not depend on the device locale. */
export function formatScheduled(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}
