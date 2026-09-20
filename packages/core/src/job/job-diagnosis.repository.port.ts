import type { JobRecord } from './job.repository.port.js';

/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P14-6 scope: OPTION A, a narrow job:update covering exactly two fields
 * — see docs/phases/PHASE_14.md §5 for the owner's scope decision.
 */
export interface UpdateJobDiagnosisInput {
  readonly jobId: string;
  /** undefined = don't touch this column; null = clear it; string = set it. */
  readonly diagnosedFault?: string | null | undefined;
  /** undefined = don't touch this column; null = clear it; string = set it. */
  readonly promisedDate?: string | null | undefined;
}

export interface JobDiagnosisRepositoryPort {
  /**
   * Plain UPDATE of job.diagnosis / job.promised_date — whichever of the
   * two input fields is not `undefined`. No status transition here; the
   * caller (renderer) decides whether to call job:transitionStatus,
   * using job-status-machine.ts's diagnosisSavedTransitionTarget (P14-3).
   * One audit_log row. No sync_outbox — these are internal operational
   * fields, not ledger/sync-relevant data (owner's explicit scope).
   */
  updateJobDiagnosisAndDate(input: UpdateJobDiagnosisInput): Promise<JobRecord>;
}
