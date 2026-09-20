import type { CancellationReason } from '@shop/contracts';
import type { JobRecord } from './job.repository.port.js';

/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P14-4 scope: cancel a job in one transaction — see
 * docs/phases/PHASE_14.md §5 for the PLAN-A..D this implementation
 * follows (source_type/source_id reuse the ORIGINAL issue row's, never a
 * new 'job_cancel' source; job.status is never UPDATEd, only
 * job_status_history gets a new row — both corrections to this phase's
 * own original brief, found by reading the live code, not assumed).
 */
export interface CancelJobInput {
  readonly jobId: string;
  readonly reason: CancellationReason;
  /** null = the cancel dialog's notes field was left blank — job.notes is
   * untouched entirely in that case, not set to null. */
  readonly notes: string | null;
}

export interface JobCancelRepositoryPort {
  /**
   * One transaction: for every 'issue' job_part row on this job with no
   * matching 'return' row (reverses_job_part_id), inserts a 'return'
   * job_part row (positive quantity, snapshotting the issue row's own
   * unit_cost/unit_price/businessUnitId) + a 'job_return' stock_movement
   * row crediting back the TECHNICIAN's custody warehouse (read from the
   * original job_issue stock_movement row, never re-derived) with the
   * exact negation of that row's quantity. Then updates job.notes (per
   * the append rule) and job.cancellationReason, inserts one
   * job_status_history row (fromStatus -> 'cancelled'), one audit_log
   * row, one sync_outbox row. Throws if the job is already 'delivered'
   * or already 'cancelled'. Write path — must be wrapped in withRetry
   * (PROJECT.md BUG-15).
   */
  cancelJob(input: CancelJobInput): Promise<JobRecord>;
}
