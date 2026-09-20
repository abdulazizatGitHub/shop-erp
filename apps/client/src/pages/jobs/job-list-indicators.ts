import type { JobSummaryDto } from '@shop/contracts';

const STALE_THRESHOLD_DAYS = 14;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** P14-7 — red dot: today > promisedDate AND status is not terminal. */
export function isJobOverdue(job: JobSummaryDto): boolean {
  return (
    job.promisedDate !== null &&
    job.promisedDate < todayIso() &&
    job.status !== 'delivered' &&
    job.status !== 'cancelled'
  );
}

/** P14-7 — amber clock: no promisedDate set, status is not terminal, and
 * the job has sat for more than STALE_THRESHOLD_DAYS since creation. */
export function isJobStale(job: JobSummaryDto): boolean {
  if (job.promisedDate !== null) return false;
  if (job.status === 'delivered' || job.status === 'cancelled') return false;
  const createdMs = new Date(job.createdAt).getTime();
  const ageDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_THRESHOLD_DAYS;
}
