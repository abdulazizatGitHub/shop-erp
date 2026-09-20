import { z } from 'zod';

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
});
export type JobDto = z.infer<typeof JobDto>;

/** P14-8 — one job_status_history row, read-only. */
export const JobStatusHistoryDto = z.object({
  fromStatus: JobStatus.nullable(),
  toStatus: JobStatus,
  changedAt: z.string(),
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

export const IssuePartsToTechnicianInput = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int().positive(),
  fromWarehouseId: z.string().uuid().nullable(),
  technicianPartyId: z.string().uuid(),
});
export type IssuePartsToTechnicianInput = z.infer<typeof IssuePartsToTechnicianInput>;

export const IssuePartsToTechnicianResult = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
});
export type IssuePartsToTechnicianResult = z.infer<typeof IssuePartsToTechnicianResult>;

export const IssuePartsToJobInput = z.object({
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantityMilli: z.number().int().positive(),
  technicianPartyId: z.string().uuid(),
  unitPricePaisa: z.number().int().nonnegative().nullable(),
  isBillable: z.boolean().default(true),
});
export type IssuePartsToJobInput = z.infer<typeof IssuePartsToJobInput>;

export const IssuePartsToJobResult = z.object({
  jobPartId: z.string().uuid(),
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantityMilli: z.number().int(),
  unitCostPaisa: z.number().int(),
  unitPricePaisa: z.number().int(),
  businessUnitId: z.string().uuid(),
});
export type IssuePartsToJobResult = z.infer<typeof IssuePartsToJobResult>;

export const RevenueType = z.enum(['customer_paid', 'contract', 'warranty', 'internal']);
export type RevenueType = z.infer<typeof RevenueType>;

export const DeliverJobPartLineInput = z.object({
  jobPartId: z.string().uuid(),
  unitPricePaisa: z.number().int().nonnegative(),
  payerPartyId: z.string().uuid().nullable(),
  revenueType: RevenueType,
});
export type DeliverJobPartLineInput = z.infer<typeof DeliverJobPartLineInput>;

export const DeliverJobLabourLineInput = z.object({
  serviceChargeId: z.string().uuid(),
  unitPricePaisa: z.number().int().nonnegative().nullable(),
  payerPartyId: z.string().uuid().nullable(),
  revenueType: RevenueType,
});
export type DeliverJobLabourLineInput = z.infer<typeof DeliverJobLabourLineInput>;

export const DeliverJobInput = z
  .object({
    jobId: z.string().uuid(),
    saleDate: z.string().min(1),
    partLines: z.array(DeliverJobPartLineInput),
    labourLines: z.array(DeliverJobLabourLineInput),
    paidPaisa: z.number().int().nonnegative(),
  })
  .refine((data) => data.partLines.length + data.labourLines.length > 0, {
    message: 'A delivery must have at least one line',
    path: ['partLines'],
  });
export type DeliverJobInput = z.infer<typeof DeliverJobInput>;

export const DeliverJobResult = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  totalAmountPaisa: z.number().int(),
});
export type DeliverJobResult = z.infer<typeof DeliverJobResult>;

export const InternalTransferReason = z.enum([
  'free_installation',
  'warranty_rework',
  'shop_own_use',
  'sample',
  'other',
]);
export type InternalTransferReason = z.infer<typeof InternalTransferReason>;

export const InternalTransferLineInput = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int().positive(),
});
export type InternalTransferLineInput = z.infer<typeof InternalTransferLineInput>;

export const CreateInternalTransferInput = z.object({
  transferDate: z.string().min(1),
  reason: InternalTransferReason,
  jobId: z.string().uuid().nullable(),
  lines: z.array(InternalTransferLineInput).min(1),
  notes: z.string().trim().min(1).nullable(),
});
export type CreateInternalTransferInput = z.infer<typeof CreateInternalTransferInput>;

export const NewInternalTransferResult = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  totalAmountPaisa: z.number().int(),
});
export type NewInternalTransferResult = z.infer<typeof NewInternalTransferResult>;

export const RecordCustodyReconciliationInput = z.object({
  warehouseId: z.string().uuid(),
  custodianPartyId: z.string().uuid(),
  reconciledOn: z.string().min(1),
  shortageValuePaisa: z.number().int().nonnegative(),
  notes: z.string().trim().min(1).nullable(),
});
export type RecordCustodyReconciliationInput = z.infer<typeof RecordCustodyReconciliationInput>;

export const CustodyReconciliationResult = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  custodianPartyId: z.string().uuid(),
  reconciledOn: z.string(),
  shortageValuePaisa: z.number().int(),
  actionTaken: z.string(),
});
export type CustodyReconciliationResult = z.infer<typeof CustodyReconciliationResult>;

export const TechnicianAssignmentDto = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  partyId: z.string().uuid(),
  assignedAt: z.string(),
  unassignedAt: z.string().nullable(),
});
export type TechnicianAssignmentDto = z.infer<typeof TechnicianAssignmentDto>;

/** P14-5 — targets one job_technician row by its own id (not jobId +
 * technicianPartyId), since a technician could in principle be
 * assigned/unassigned/reassigned to the same job more than once over
 * time and only the specific active row should be closed. */
export const UnassignTechnicianInput = z.object({
  id: z.string().uuid(),
});
export type UnassignTechnicianInput = z.infer<typeof UnassignTechnicianInput>;

export const JobSummaryDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  customerId: z.string().uuid().nullable(),
  customerNameAdhoc: z.string().nullable(),
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
