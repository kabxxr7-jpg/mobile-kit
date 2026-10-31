export const JOB_STATUSES = ["open", "in_progress", "done"] as const;
export const JOB_PRIORITIES = ["low", "normal", "urgent"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export interface Job {
  id: string;
  title: string;
  customer: string;
  address: string;
  status: JobStatus;
  priority: JobPriority;
  /** ISO-8601 timestamp. */
  scheduledAt: string;
  notes: string;
}

export interface JobPage {
  items: Job[];
  /** Pass this back as `cursor` to get the next page; null means this was the last page. */
  nextCursor: string | null;
}
