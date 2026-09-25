/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Phase 16, P16-3a Checkpoint 2 (docs/phases/PHASE_16.md §2a, ADR-0015).
 */

export interface TechnicianHistoryEntry {
  readonly technicianPartyId: string;
  readonly technicianName: string;
  readonly assignedAt: string;
  readonly unassignedAt: string | null;
  /** P16-3c (OD-16-5) — null while active; the stored removal reason once unassigned. */
  readonly unassignReason: string | null;
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
  /** The FIX-C2 snapshot — lets the UI show the basis ("Rs 500 fixed" / "10% of Rs 4,000") without re-reading the (possibly since-edited) service_charge row. */
  readonly commissionMode: 'fixed' | 'bp';
  readonly commissionAmountPaisa: number | null;
  readonly commissionBp: number | null;
}

/**
 * P16-3b — Commission Approvals must show decided claims too, not only
 * pending ones (so the owner can find and reverse a past decision).
 * `status` mirrors OD-16-3a's pending definition inverted: a claim with
 * no decision, or whose latest decision has a reversal, is 'pending';
 * otherwise 'approved'/'rejected' per the latest decision.
 */
export interface ClaimSummary extends PendingClaimSummary {
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly latestDecisionId: string | null;
  readonly latestDecisionTotalPaisa: number | null;
  readonly latestDecisionReason: string | null;
}

export interface ClaimDetail extends PendingClaimSummary {
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
  /** Every claim, pending or decided (P16-3b: decided claims stay visible, with a Reverse action). */
  listAllClaims(): Promise<readonly ClaimSummary[]>;
  getClaimDetail(claimId: string): Promise<ClaimDetail>;
  approveClaim(input: ApproveClaimInput): Promise<DecisionRecord>;
  rejectClaim(input: RejectClaimInput): Promise<DecisionRecord>;
  reverseDecision(input: ReverseDecisionInput): Promise<void>;
}
