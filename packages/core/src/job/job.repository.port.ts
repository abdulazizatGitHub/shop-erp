/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See docs/ARCHITECTURE.md
 * section 2, "Why the domain layer is pure."
 *
 * P6-1 scope: read path only. Write methods (createJob, issueParts...,
 * deliverJob, ...) are added in later Phase 6 tasks (P6-2 onward, see
 * docs/phases/PHASE_6.md §4).
 */
export type JobStatus =
  | 'received'
  | 'diagnosed'
  | 'awaiting_approval'
  | 'awaiting_parts'
  | 'in_progress'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export interface JobRecord {
  readonly id: string;
  readonly docNo: string;
  readonly customerId: string | null;
  readonly customerNameAdhoc: string | null;
  readonly customerPhone: string | null;
  readonly jobType: string;
  readonly applianceType: string | null;
  readonly applianceBrand: string | null;
  readonly applianceModel: string | null;
  readonly applianceSerial: string | null;
  readonly reportedFault: string | null;
  readonly receivedDate: string;
  readonly promisedDate: string | null;
  readonly estimateAmountPaisa: number | null;
  readonly estimateApproved: boolean;
  readonly assignedTo: string | null;
  readonly status: JobStatus;
  readonly businessUnitId: string | null;
  /** Default/estimate shown at intake — NOT the billing source of truth (GAP-3/ADR-0007). */
  readonly billToPartyId: string | null;
  readonly revenueType: string;
  readonly labourChargePaisa: number;
  readonly saleId: string | null;
}

/** All fields optional/null — an unset field is not filtered on. */
export interface JobSearchQuery {
  readonly status: JobStatus | null;
  readonly assignedTo: string | null;
  readonly customerId: string | null;
}

/** Line-free summary row — a list view has no use for per-line detail. */
export interface JobSummaryRecord {
  readonly id: string;
  readonly docNo: string;
  readonly customerId: string | null;
  readonly customerNameAdhoc: string | null;
  readonly jobType: string;
  readonly status: JobStatus;
  readonly receivedDate: string;
  readonly assignedTo: string | null;
  readonly applianceType: string | null;
  readonly applianceBrand: string | null;
  readonly reportedFault: string | null;
}

/** Mirrors v_job_split's columns exactly — see 0010_job_additions.sql. */
export interface JobSplitRecord {
  readonly jobId: string;
  readonly docNo: string;
  readonly receivedDate: string;
  readonly jobType: string;
  readonly revenueType: string;
  readonly status: string;
  readonly customerName: string | null;
  readonly billedToName: string | null;
  readonly technicianName: string | null;
  readonly partsChargedPaisa: number;
  readonly partsCostPaisa: number;
  readonly partsMarginPaisa: number;
  readonly labourChargePaisa: number;
  readonly totalBillPaisa: number;
}

export interface TechnicianCustodyRecord {
  readonly itemId: string;
  readonly itemName: string;
  readonly qtyHeldMilli: number;
  readonly lastMovement: string | null;
  /** The technician's custody warehouse id — same value on every row for a
   * given technician. Needed client-side to call reconcileCustody, which
   * takes warehouseId directly rather than deriving it from a party id. */
  readonly warehouseId: string;
}

export interface NewJobInput {
  readonly customerId: string | null;
  readonly customerNameAdhoc: string | null;
  readonly customerPhone: string | null;
  readonly jobType: string;
  readonly applianceType: string | null;
  readonly applianceBrand: string | null;
  readonly applianceModel: string | null;
  readonly applianceSerial: string | null;
  readonly reportedFault: string | null;
  readonly receivedDate: string;
  readonly promisedDate: string | null;
  readonly estimateAmountPaisa: number | null;
  readonly assignedTo: string | null;
  readonly notes: string | null;
}

export interface JobStatusTransitionInput {
  readonly jobId: string;
  readonly toStatus: JobStatus;
  readonly note: string | null;
}

export interface AssignTechnicianInput {
  readonly jobId: string;
  readonly technicianPartyId: string;
}

export interface JobRepositoryPort {
  /**
   * Current status is always DERIVED from the latest job_status_history
   * row for this job, never read from the job.status column directly
   * (GAP-6's STATUS MACHINE rule — see updateJobStatus below for why).
   */
  getJob(id: string): Promise<JobRecord | null>;
  /** Plain filtered SELECT, most recent first — no business logic. */
  listJobs(query: JobSearchQuery): Promise<readonly JobSummaryRecord[]>;
  /** Reads v_job_split directly — never re-implements its aggregation. */
  getJobSplit(jobId: string): Promise<JobSplitRecord | null>;
  /**
   * What one technician currently holds, in exact milli-units.
   * Deliberately does NOT read v_technician_custody: that view's
   * qty_held column is `SUM(sm.quantity) / 1000.0` — a float division
   * done in SQL, violating CLAUDE.md §3.2's "quantity is INTEGER
   * milli-units; convert only at display time" rule. Re-implements the
   * identical WHERE/GROUP BY/HAVING here, summing the raw milli-unit
   * integer instead. Found while designing P6-1, not fixed at the
   * view level — v_technician_custody is pre-existing (0002), untouched
   * by 0010, and still fine for anything that only ever displays it.
   */
  getTechnicianCustody(technicianPartyId: string): Promise<readonly TechnicianCustodyRecord[]>;
  /**
   * INSERT job (status column set once, to 'received', at creation —
   * never written again after this) + INSERT job_status_history
   * (from_status = null, to_status = 'received') + document_sequence
   * (JOB-NNNN) + audit_log + sync_outbox, one transaction. Write path —
   * must be wrapped in withRetry (PROJECT.md BUG-15).
   */
  createJob(input: NewJobInput): Promise<JobRecord>;
  /**
   * INSERT-only status transition. Despite the name, this NEVER runs
   * `UPDATE job SET status = ...` — it inserts one job_status_history
   * row (from_status = the job's current derived status, to_status =
   * input.toStatus) and nothing else touches the job.status column
   * after createJob's initial insert. "Current status" is always
   * computed by reading the latest job_status_history row (see getJob).
   * Named to match docs/phases/PHASE_6.md's task list for traceability,
   * not because it updates a column.
   */
  updateJobStatus(input: JobStatusTransitionInput): Promise<JobRecord>;
  /** Plain UPDATE to job.assigned_to — job is not an append-only table. */
  assignTechnician(input: AssignTechnicianInput): Promise<JobRecord>;
}
