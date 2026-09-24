/**
 * Phase 16, P16-3a Checkpoint 2 (docs/phases/PHASE_16.md §2a OD-16-3/
 * OD-16-3a/OD-16-12, ADR-0015). Pure validation only — no DB, no
 * Electron, no React. The repository (commission-decision.repository.ts)
 * does all the reading (claim state, job_technician history, party
 * lookups) and calls these functions before writing anything, exactly
 * as job-delivery.repository.ts calls computeLineTotalPaisa.
 */

export interface RecipientInput {
  readonly technicianPartyId: string;
  readonly amountPaisa: number;
  /** Non-null only when the recipient is not in the job's technician history (OD-16-12). */
  readonly outsideHistoryReason: string | null;
}

export interface RecipientPartyInfo {
  readonly partyType: string;
  readonly isActive: boolean;
}

/**
 * OD-16-3's approval rule plus OD-16-12's recipient correction:
 * - at least one recipient;
 * - no recipient listed twice;
 * - every amount > 0;
 * - every recipient an active staff party (any active staff party is
 *   now eligible — not limited to the job's technician history);
 * - a recipient outside the job's technician history requires a
 *   non-blank, trimmed outsideHistoryReason; one inside it must not
 *   carry one (kept null — the reason exists to make an unusual payment
 *   auditable, not to annotate the normal case).
 *
 * `partyLookup` returns undefined for an unknown id — treated the same
 * as "not staff" (rejected).
 */
export function validateApprovalRecipients(
  recipients: readonly RecipientInput[],
  jobTechnicianPartyIds: ReadonlySet<string>,
  partyLookup: (partyId: string) => RecipientPartyInfo | undefined,
): void {
  if (recipients.length === 0) {
    throw new Error('Approval requires at least one recipient');
  }

  const seen = new Set<string>();
  for (const recipient of recipients) {
    if (seen.has(recipient.technicianPartyId)) {
      throw new Error(`Recipient ${recipient.technicianPartyId} is listed more than once`);
    }
    seen.add(recipient.technicianPartyId);

    if (recipient.amountPaisa <= 0) {
      throw new Error(
        `Recipient ${recipient.technicianPartyId} amount must be > 0, got ${String(recipient.amountPaisa)}`,
      );
    }

    const party = partyLookup(recipient.technicianPartyId);
    if (!party || party.partyType !== 'staff' || !party.isActive) {
      throw new Error(`Recipient ${recipient.technicianPartyId} must be an active staff party`);
    }

    const inHistory = jobTechnicianPartyIds.has(recipient.technicianPartyId);
    if (!inHistory) {
      const reason = recipient.outsideHistoryReason;
      if (reason === null || reason.trim().length === 0) {
        throw new Error(
          `Recipient ${recipient.technicianPartyId} is not in the job's technician assignment history and requires a non-blank outsideHistoryReason`,
        );
      }
    }
  }
}

/** Reject/reverse reasons, and any other "explain yourself" free text this model requires — trimmed, non-blank. */
export function assertNonBlankReason(reason: string, fieldLabel: string): void {
  if (reason.trim().length === 0) {
    throw new Error(`${fieldLabel} must not be blank`);
  }
}

/**
 * OD-16-3a's pending definition: a claim with no decision, or whose
 * latest decision has a reversal. `latestDecision` is undefined when the
 * claim has never been decided.
 */
export function isClaimPending(
  latestDecision: { readonly hasReversal: boolean } | undefined,
): boolean {
  return latestDecision === undefined || latestDecision.hasReversal;
}
