/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Phase 17.5 (docs/phases/PHASE_17_5.md), ADR-0016. Own module, not
 * colocated with cash-session's (a deliberate difference from that
 * module's own precedent) — `cash_movement` is a distinct table with
 * its own lifecycle (record/reverse/list), not a variant of session
 * open/close.
 */

/** bank_deposit/owner_draw are always cash OUT; float_add is always cash IN; other is either — enforced by assertCashMovementValid, not here. */
export type CashMovementType = 'bank_deposit' | 'owner_draw' | 'float_add' | 'other';

export interface CashMovementRecord {
  readonly id: string;
  readonly docNo: string;
  /** Always the open session's own `sessionDate` at the moment this was recorded — never the wall clock (review round 3, R6). */
  readonly movementDate: string;
  readonly movementType: CashMovementType;
  /** Paisa, SIGNED (+in / -out). */
  readonly amountPaisa: number;
  /** Required, non-blank, on every movement (review round 2, R4). */
  readonly note: string;
  /** Set only on a reversal row, pointing back at the original it corrects. Null for an original (non-reversal) movement. */
  readonly reversesId: string | null;
  readonly createdAt: string;
}

export interface NewCashMovementInput {
  readonly movementType: CashMovementType;
  readonly amountPaisa: number;
  readonly note: string;
}

export interface ReverseCashMovementRepoInput {
  readonly originalId: string;
  /** Same `note` requirement as any movement — required, non-blank. */
  readonly note: string;
}

/**
 * Phase 17.5, review round 2 R3. Thrown when attempting to reverse a
 * movement that already has a reversal referencing it — checked in the
 * repository before the insert is attempted (`UNIQUE(reverses_id)`
 * stays as the backstop for the check-then-insert race window), same
 * two-layer shape as `SessionAlreadyOpenError`.
 */
export class CashMovementAlreadyReversedError extends Error {
  readonly code = 'CASH_MOVEMENT_ALREADY_REVERSED';

  constructor(originalId: string) {
    super(`Cash movement ${originalId} has already been reversed.`);
    this.name = 'CashMovementAlreadyReversedError';
  }
}

/**
 * Phase 17.5, review round 3 R7. Thrown when attempting to reverse a
 * movement whose own day is no longer the currently-open session —
 * either no session is open at all, or a different date's session is
 * open. Reversing across a session boundary would double-count the
 * correction (see ADR-0016's Consequences for the full reasoning) —
 * the exact wording here is user-facing, shown verbatim in the UI.
 */
export class CashMovementSessionClosedError extends Error {
  readonly code = 'CASH_MOVEMENT_SESSION_CLOSED';

  constructor() {
    super(
      'That day is closed — its cash difference already reflects this. Add a note to the closed session instead.',
    );
    this.name = 'CashMovementSessionClosedError';
  }
}

/** Phase 17.5, review round 3 R7. A reversal row (`reversesId !== null`) can never itself be the target of a further reversal — one level of correction only, same precedent as `commission_decision_reversal` (ADR-0015). */
export class ReversalOfReversalError extends Error {
  readonly code = 'REVERSAL_OF_REVERSAL';

  constructor(id: string) {
    super(`Cash movement ${id} is itself a reversal and cannot be reversed.`);
    this.name = 'ReversalOfReversalError';
  }
}

export interface CashMovementRepositoryPort {
  /**
   * ONE TRANSACTION: verifies a session is currently open
   * (CashSessionNotOpenError otherwise), resolves `movementDate` from
   * that open session's own `sessionDate` (never the wall clock —
   * review round 3 R6), then cash_movement insert + audit_log +
   * sync_outbox.
   */
  recordMovement(input: NewCashMovementInput): Promise<CashMovementRecord>;
  /**
   * ONE TRANSACTION: verifies a session is currently open and that its
   * date matches the original movement's own `movementDate`
   * (CashMovementSessionClosedError otherwise — review round 3 R7);
   * verifies the original is not itself a reversal
   * (ReversalOfReversalError); verifies no existing reversal already
   * references it (CashMovementAlreadyReversedError, pre-checked before
   * the insert, `UNIQUE(reverses_id)` as the backstop); then inserts
   * one new row with `amount` negated and `reversesId` set, same
   * three-way insert as `recordMovement`.
   */
  reverseMovement(input: ReverseCashMovementRepoInput): Promise<CashMovementRecord>;
  /** Every movement (original and reversal rows) with `movementDate` in `[dateFrom, dateTo]`, for the Cash Book report. */
  listForDateRange(dateFrom: string, dateTo: string): Promise<readonly CashMovementRecord[]>;
}
