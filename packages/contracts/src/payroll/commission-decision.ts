import { z } from 'zod';

/**
 * Phase 16, P16-3a Checkpoint 2 (docs/phases/PHASE_16.md §2a OD-16-3/
 * OD-16-3a/OD-16-12, ADR-0015). Zod-boundary half of the "Zod + core"
 * double validation — the other half is
 * packages/core/src/payroll/commission-decision.ts's
 * validateApprovalRecipients/assertNonBlankReason, re-checked
 * independently so a caller bypassing Zod cannot skip the invariant.
 */

export const ApproveClaimRecipientInput = z.object({
  technicianPartyId: z.string().uuid(),
  amountPaisa: z.number().int().positive(),
  outsideHistoryReason: z.string().trim().min(1).max(500).nullable(),
});
export type ApproveClaimRecipientInput = z.infer<typeof ApproveClaimRecipientInput>;

export const ApproveClaimInput = z.object({
  claimId: z.string().uuid(),
  recipients: z.array(ApproveClaimRecipientInput).min(1),
  decidedAt: z.string().min(1),
});
export type ApproveClaimInput = z.infer<typeof ApproveClaimInput>;

export const RejectClaimInput = z.object({
  claimId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  decidedAt: z.string().min(1),
});
export type RejectClaimInput = z.infer<typeof RejectClaimInput>;

export const ReverseDecisionInput = z.object({
  decisionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  reversedAt: z.string().min(1),
});
export type ReverseDecisionInput = z.infer<typeof ReverseDecisionInput>;

export const GetClaimDetailInput = z.object({
  claimId: z.string().uuid(),
});
export type GetClaimDetailInput = z.infer<typeof GetClaimDetailInput>;

export const PendingClaimSummaryDto = z.object({
  claimId: z.string().uuid(),
  jobId: z.string().uuid(),
  jobDocNo: z.string(),
  customerName: z.string(),
  serviceChargeName: z.string(),
  labourAmountPaisa: z.number().int(),
  suggestedAmountPaisa: z.number().int(),
  suggestedRecipientPartyId: z.string().uuid().nullable(),
  commissionMode: z.enum(['fixed', 'bp']),
  commissionAmountPaisa: z.number().int().nullable(),
  commissionBp: z.number().int().nullable(),
});
export type PendingClaimSummaryDto = z.infer<typeof PendingClaimSummaryDto>;

export const ClaimSummaryDto = PendingClaimSummaryDto.extend({
  status: z.enum(['pending', 'approved', 'rejected']),
  latestDecisionId: z.string().uuid().nullable(),
  latestDecisionTotalPaisa: z.number().int().nullable(),
  latestDecisionReason: z.string().nullable(),
});
export type ClaimSummaryDto = z.infer<typeof ClaimSummaryDto>;

export const TechnicianHistoryEntryDto = z.object({
  technicianPartyId: z.string().uuid(),
  technicianName: z.string(),
  assignedAt: z.string(),
  unassignedAt: z.string().nullable(),
});
export type TechnicianHistoryEntryDto = z.infer<typeof TechnicianHistoryEntryDto>;

export const DecisionRecipientRecordDto = z.object({
  technicianPartyId: z.string().uuid(),
  technicianName: z.string(),
  amountPaisa: z.number().int(),
  outsideHistoryReason: z.string().nullable(),
});
export type DecisionRecipientRecordDto = z.infer<typeof DecisionRecipientRecordDto>;

export const DecisionRecordDto = z.object({
  id: z.string().uuid(),
  attemptNo: z.number().int(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().nullable(),
  decidedAt: z.string(),
  recipients: z.array(DecisionRecipientRecordDto),
  reversal: z.object({ reason: z.string(), reversedAt: z.string() }).nullable(),
});
export type DecisionRecordDto = z.infer<typeof DecisionRecordDto>;

export const ClaimDetailDto = z.object({
  claimId: z.string().uuid(),
  jobId: z.string().uuid(),
  jobDocNo: z.string(),
  customerName: z.string(),
  serviceChargeName: z.string(),
  labourAmountPaisa: z.number().int(),
  suggestedAmountPaisa: z.number().int(),
  suggestedRecipientPartyId: z.string().uuid().nullable(),
  commissionMode: z.enum(['fixed', 'bp']),
  commissionAmountPaisa: z.number().int().nullable(),
  commissionBp: z.number().int().nullable(),
  technicianHistory: z.array(TechnicianHistoryEntryDto),
  decisions: z.array(DecisionRecordDto),
});
export type ClaimDetailDto = z.infer<typeof ClaimDetailDto>;
