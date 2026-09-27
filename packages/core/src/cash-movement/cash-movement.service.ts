import {
  CashMovementSessionClosedError,
  ReversalOfReversalError,
  type CashMovementRecord,
  type CashMovementType,
} from './cash-movement.repository.port.js';

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), review round 2 R4 / round 3
 * R7. Pure validation — no DB, same `assertX` precedent as
 * `assertCommissionModeConsistent` (packages/core/src/job/service-charge.service.ts).
 *
 * Sign-per-type applies to ORIGINAL (non-reversal) rows only — a
 * reversal is validated separately by `assertReversalValid`, which
 * checks the exact negation instead (a reversal of a negative
 * `bank_deposit` is itself positive by definition, and enforcing
 * "always negative" against it too would be self-contradictory).
 */
export function assertCashMovementValid(
  type: CashMovementType,
  amountPaisa: number,
  note: string,
): void {
  if (amountPaisa === 0) {
    throw new Error('Cash movement amount cannot be zero.');
  }
  if (note.trim().length === 0) {
    throw new Error('A note is required for every cash movement.');
  }

  if ((type === 'bank_deposit' || type === 'owner_draw') && amountPaisa >= 0) {
    throw new Error(`"${type}" must be a negative amount (cash leaving the drawer).`);
  }
  if (type === 'float_add' && amountPaisa <= 0) {
    throw new Error('"float_add" must be a positive amount (cash added to the drawer).');
  }
  // 'other' may be either sign — no further check.
}

/**
 * Phase 17.5, review round 3 R7. Validates a reversal against its
 * original: exact negation, one-level-only correction, and the
 * session-scoping rule (the original's own day must still be the
 * currently-open session — reversing across a session boundary would
 * double-count the correction, see ADR-0016's Consequences).
 *
 * `openSessionDate` is the currently-open session's own `sessionDate`
 * (null if no session is open at all) — resolved by the repository via
 * `getOpenSession()` before calling this, never re-derived here (this
 * function has no DB access).
 */
export function assertReversalValid(
  original: CashMovementRecord,
  reversalAmountPaisa: number,
  openSessionDate: string | null,
): void {
  if (original.reversesId !== null) {
    throw new ReversalOfReversalError(original.id);
  }
  if (reversalAmountPaisa !== -original.amountPaisa) {
    throw new Error(
      `Reversal amount must be the exact opposite of the original (expected ${String(
        -original.amountPaisa,
      )}, got ${String(reversalAmountPaisa)}).`,
    );
  }
  if (openSessionDate !== original.movementDate) {
    throw new CashMovementSessionClosedError();
  }
}
