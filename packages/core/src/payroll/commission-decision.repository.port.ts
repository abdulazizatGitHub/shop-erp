/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Phase 16, P16-3a Checkpoint 2 (docs/phases/PHASE_16.md §2a, ADR-0015).
 */

export interface TechnicianHistoryEntry {
  readonly technicianPartyId: string;
  readonly technicianName: string;
  readonly assignedAt: string;
  readonly unassignedAt: string | null;
}

export interface DecisionRecipientRecord {
  readonly technicianPartyId: string;
  readonly technicianName: string;
  readonly amountPaisa: number;
  readonly outsideHistoryReason: string | null;
}

export interface DecisionRecord {
  readonly id: string;
  readonly attemptNo: number;
  readonly decision: 'approved' | 'rejected';
  readonly reason: string | null;
  readonly decidedAt: string;
  readonly recipients: readonly DecisionRecipientRecord[];
  readonly reversal: { readonly reason: string; readonly reversedAt: string } | null;
}

export interface PendingClaimSummary {
  readonly claimId: string;
  readonly jobId: string;
  readonly jobDocNo: string;
  readonly customerName: string;
  readonly serviceChargeName: string;
  readonly labourAmountPaisa: number;
  readonly suggestedAmountPaisa: number;
  readonly suggestedRecipientPartyId: string | null;
}

export interface ClaimDetail {
  readonly claimId: string;
  readonly jobId: string;
  readonly jobDocNo: string;
  readonly customerName: string;
  readonly serviceChargeName: string;
  readonly labourAmountPaisa: number;
  readonly suggestedAmountPaisa: number;
  readonly suggestedRecipientPartyId: string | null;
  readonly technicianHistory: readonly TechnicianHistoryEntry[];
  readonly decisions: readonly DecisionRecord[];
}

export interface ApproveClaimInput {
  readonly claimId: string;
  readonly recipients: readonly {
    readonly technicianPartyId: string;
    readonly amountPaisa: number;
    readonly outsideHistoryReason: string | null;
  }[];
  readonly decidedAt: string;
}

export interface RejectClaimInput {
  readonly claimId: string;
  readonly reason: string;
  readonly decidedAt: string;
}

export interface ReverseDecisionInput {
  readonly decisionId: string;
  readonly reason: string;
  readonly reversedAt: string;
}

export interface CommissionDecisionRepositoryPort {
  listPendingClaims(): Promise<readonly PendingClaimSummary[]>;
  getClaimDetail(claimId: string): Promise<ClaimDetail>;
  approveClaim(input: ApproveClaimInput): Promise<DecisionRecord>;
  rejectClaim(input: RejectClaimInput): Promise<DecisionRecord>;
  reverseDecision(input: ReverseDecisionInput): Promise<void>;
}
