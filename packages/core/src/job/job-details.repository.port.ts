import type { JobRecord } from './job.repository.port.js';

/**
 * Repository interface (port) — defined here in core, implemented in db.
 * I4 — partial resolution of BUG-17: a narrow job:update covering only
 * fields that need no stock/ledger write. Same undefined-means-skip
 * pattern as UpdateJobDiagnosisInput (job-diagnosis.repository.port.ts).
 */
export interface UpdateJobDetailsInput {
  readonly jobId: string;
  readonly jobClientId?: string | null | undefined;
  readonly applianceType?: string | null | undefined;
  readonly applianceBrand?: string | null | undefined;
  readonly applianceModel?: string | null | undefined;
  readonly applianceSerial?: string | null | undefined;
  readonly reportedFault?: string | null | undefined;
  readonly promisedDate?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

export interface JobDetailsRepositoryPort {
  /**
   * Plain UPDATE of exactly the fields above that are not `undefined`.
   * No status field, no money field, no saleId, no cancellation — those
   * have their own dedicated write paths. Guarded: throws if the job's
   * current status is 'delivered' or 'cancelled', writing nothing.
   * One audit_log row listing the changed fields. No sync_outbox —
   * same internal-operational-field reasoning as updateJobDiagnosisAndDate.
   */
  updateJobDetails(input: UpdateJobDetailsInput): Promise<JobRecord>;
}
