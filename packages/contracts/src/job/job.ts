import { z } from 'zod';
import { CreateJobClientInput } from './job-client.js';

/** GAP-6: the schema's existing 8 states — 0001_init.sql's job.status comment. */
export const JobStatus = z.enum([
  'received',
  'diagnosed',
  'awaiting_approval',
  'awaiting_parts',
  'in_progress',
  'ready',
  'delivered',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const CreateJobInput = z.object({
  customerId: z.string().uuid().nullable(),
  customerNameAdhoc: z.string().trim().min(1).nullable(),
  customerPhone: z.string().trim().min(1).nullable(),
  /** Phase 15 — an existing job_client to link, OR newClient to create one
   * in the same transaction. At most one of the two should be set; both
   * null means no client recorded (walk-in, OD-3). Independent of and
   * additive to customerId above — that legacy party-linked field is
   * never removed or zeroed out (OD-3, BUG-JOBCLIENT-1). */
  jobClientId: z.string().uuid().nullable(),
  newClient: CreateJobClientInput.nullable(),
  jobType: z.enum(['in_shop', 'on_site', 'installation']),
  applianceType: z.string().trim().min(1).nullable(),
  applianceBrand: z.string().trim().min(1).nullable(),
  applianceModel: z.string().trim().min(1).nullable(),
  applianceSerial: z.string().trim().min(1).nullable(),
  reportedFault: z.string().trim().min(1).nullable(),
  receivedDate: z.string().min(1),
  promisedDate: z.string().min(1).nullable(),
  estimateAmountPaisa: z.number().int().nonnegative().nullable(),
  assignedTo: z.string().uuid().nullable(),
  notes: z.string().trim().min(1).nullable(),
});
export type CreateJobInput = z.infer<typeof CreateJobInput>;

export const JobStatusTransitionInput = z.object({
  jobId: z.string().uuid(),
  toStatus: JobStatus,
  note: z.string().trim().min(1).nullable(),
});
export type JobStatusTransitionInput = z.infer<typeof JobStatusTransitionInput>;

export const AssignTechnicianInput = z.object({
  jobId: z.string().uuid(),
  technicianPartyId: z.string().uuid(),
});
export type AssignTechnicianInput = z.infer<typeof AssignTechnicianInput>;

export const JobIdInput = z.object({
  id: z.string().uuid(),
});
export type JobIdInput = z.infer<typeof JobIdInput>;

export const TechnicianCustodyInput = z.object({
  technicianPartyId: z.string().uuid(),
});
export type TechnicianCustodyInput = z.infer<typeof TechnicianCustodyInput>;

/** All fields optional/null — an unset field is not filtered on. */
export const JobSearchInput = z.object({
  status: JobStatus.nullable().default(null),
  assignedTo: z.string().uuid().nullable().default(null),
  customerId: z.string().uuid().nullable().default(null),
});
export type JobSearchInput = z.infer<typeof JobSearchInput>;

export const JobDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  customerId: z.string().uuid().nullable(),
  customerNameAdhoc: z.string().nullable(),
  customerPhone: z.string().nullable(),
  jobClientId: z.string().uuid().nullable(),
  jobClientName: z.string().nullable(),
  jobClientPhone: z.string().nullable(),
  jobType: z.string(),
  applianceType: z.string().nullable(),
  applianceBrand: z.string().nullable(),
  applianceModel: z.string().nullable(),
  applianceSerial: z.string().nullable(),
  reportedFault: z.string().nullable(),
  receivedDate: z.string(),
  promisedDate: z.string().nullable(),
  estimateAmountPaisa: z.number().int().nullable(),
  estimateApproved: z.boolean(),
  assignedTo: z.string().uuid().nullable(),
  status: JobStatus,
  businessUnitId: z.string().uuid().nullable(),
  billToPartyId: z.string().uuid().nullable(),
  revenueType: z.string(),
  labourChargePaisa: z.number().int(),
  saleId: z.string().uuid().nullable(),
  invoiceDocNo: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  /** P14-6 — the existing job.diagnosis column (Q-A), named diagnosedFault at the DTO layer. */
  diagnosedFault: z.string().nullable(),
  /** P14-8 — fallback timestamp for the synthesised diagnosis History event. */
  updatedAt: z.string(),
  /** I4 — job.notes, read-only until now (write-only since creation/cancel-append). */
  notes: z.string().nullable(),
});
export type JobDto = z.infer<typeof JobDto>;

/** P14-8 — one job_status_history row, read-only. */
export const JobStatusHistoryDto = z.object({
  fromStatus: JobStatus.nullable(),
  toStatus: JobStatus,
  changedAt: z.string(),
  note: z.string().nullable(),
});
export type JobStatusHistoryDto = z.infer<typeof JobStatusHistoryDto>;

/**
 * P14-6 — narrow update endpoint (BUG-17's job:update stays unbuilt;
 * this covers exactly the two fields P14-6 needs, owner-approved as an
 * explicit exception, 2026-09-20). Both fields are .nullable().optional():
 * omitted entirely = "don't touch this column"; explicit null = "clear
 * it". tenantId is NOT part of this contract — every other job.* input
 * in this file omits it too; it's always injected server-side from the
 * handler's own deps, never accepted from the renderer (multi-tenant
 * isolation boundary).
 */
export const UpdateJobDiagnosisInput = z.object({
  jobId: z.string().uuid(),
  diagnosedFault: z.string().nullable().optional(),
  promisedDate: z.string().nullable().optional(),
});
export type UpdateJobDiagnosisInput = z.infer<typeof UpdateJobDiagnosisInput>;

/**
 * I4 — partial resolution of BUG-17: a narrow job:update covering only
 * fields that need no stock/ledger write (READ-2's confirmed set), same
 * undefined-means-skip pattern as UpdateJobDiagnosisInput above. No
 * status field, no money field, no saleId, no cancellation — those stay
 * on their own dedicated endpoints. Guarded server-side against
 * delivered/cancelled jobs (job-details.repository.ts).
 */
export const UpdateJobDetailsInput = z.object({
  jobId: z.string().uuid(),
  jobClientId: z.string().uuid().nullable().optional(),
  applianceType: z.string().trim().min(1).nullable().optional(),
  applianceBrand: z.string().trim().min(1).nullable().optional(),
  applianceModel: z.string().trim().min(1).nullable().optional(),
  applianceSerial: z.string().trim().min(1).nullable().optional(),
  reportedFault: z.string().trim().min(1).nullable().optional(),
  promisedDate: z.string().min(1).nullable().optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});
export type UpdateJobDetailsInput = z.infer<typeof UpdateJobDetailsInput>;

/** OD-2 — fixed list, not free text. Stored in job.cancellation_reason (migration 0015). */
export const CancellationReason = z.enum([
  'customer_declined_estimate',
  'unrepairable',
  'customer_collected_unrepaired',
  'duplicate_job',
  'other',
]);
export type CancellationReason = z.infer<typeof CancellationReason>;

export const CancelJobInput = z.object({
  jobId: z.string().uuid(),
  reason: CancellationReason,
  notes: z.string().trim().min(1).nullable(),
});
export type CancelJobInput = z.infer<typeof CancelJobInput>;

export const TechnicianAssignmentDto = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  partyId: z.string().uuid(),
  assignedAt: z.string(),
  unassignedAt: z.string().nullable(),
  /** P16-3c (OD-16-5) — null while active; the stored removal reason once unassigned. */
  unassignReason: z.string().nullable(),
});
export type TechnicianAssignmentDto = z.infer<typeof TechnicianAssignmentDto>;

/** P14-5 — targets one job_technician row by its own id (not jobId +
 * technicianPartyId), since a technician could in principle be
 * assigned/unassigned/reassigned to the same job more than once over
 * time and only the specific active row should be closed.
 * P16-3c (OD-16-5): reason is now required — trimmed, non-blank. This is
 * the Zod half of the "Zod + core" double validation; the other half is
 * technician-assignment.ts's assertUnassignReasonProvided, re-checked in
 * the repository regardless of what reaches it here. */
export const UnassignTechnicianInput = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
export type UnassignTechnicianInput = z.infer<typeof UnassignTechnicianInput>;

export const JobSummaryDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  customerId: z.string().uuid().nullable(),
  customerNameAdhoc: z.string().nullable(),
  jobClientId: z.string().uuid().nullable(),
  jobClientName: z.string().nullable(),
  jobClientPhone: z.string().nullable(),
  jobType: z.string(),
  status: JobStatus,
  receivedDate: z.string(),
  assignedTo: z.string().uuid().nullable(),
  applianceType: z.string().nullable(),
  applianceBrand: z.string().nullable(),
  reportedFault: z.string().nullable(),
  /**
   * P14-7/Q-C — owner-approved narrow exception to Phase 14's
   * renderer-only rule: widening an existing read, no schema change, no
   * new IPC channel. Needed for the list's overdue/stale indicators.
   */
  promisedDate: z.string().nullable(),
  createdAt: z.string(),
  /** P14-6 — job.diagnosis, shown in the list's Fault column ahead of reportedFault when set. */
  diagnosedFault: z.string().nullable(),
  /** P14-7 — same narrow-exception widening as promisedDate/createdAt: needed so the
   * list's print icon (delivered jobs) can call invoice:printSaleInvoice without an
   * extra job:getById round trip per click. */
  saleId: z.string().uuid().nullable(),
});
export type JobSummaryDto = z.infer<typeof JobSummaryDto>;
