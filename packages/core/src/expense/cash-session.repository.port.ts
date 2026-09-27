/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Colocated with expense.repository.port.ts, same module (P7-5 brief's
 * own instruction). No tenantId parameter on any method, same precedent
 * as every other port this phase.
 *
 * Methods return CashSessionRecord (a core-level type), not the Zod
 * CashSessionDto directly — same shape as AdvanceRepositoryPort/
 * ExpenseRepositoryPort (P7-3/P7-4): the port returns a plain core
 * record, the IPC handler maps it to the contracts DTO. Kept this
 * consistent rather than switching to a DTO-returning port for this one
 * module.
 */

export type CashSessionStatus = 'open' | 'closed';

export interface CashSessionRecord {
  readonly id: string;
  readonly sessionDate: string;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly openingCashPaisa: number;
  readonly expectedCashPaisa: number | null;
  readonly countedCashPaisa: number | null;
  readonly differencePaisa: number | null;
  readonly status: CashSessionStatus;
}

export interface OpenSessionRepoInput {
  readonly date: string;
  readonly openingCashPaisa: number;
}

export interface CloseSessionRepoInput {
  readonly sessionId: string;
  readonly countedCashPaisa: number;
}

/**
 * Thrown when opening a session for a date that already has one
 * (UNIQUE(tenant_id, session_date)) — same shape as DbBusyError
 * (packages/db/src/retry.ts): a clean, serializable error crossing the
 * IPC boundary, never the raw better-sqlite3 SqliteError.
 */
export class SessionAlreadyOpenError extends Error {
  readonly code = 'SESSION_ALREADY_OPEN';

  constructor(date: string) {
    super(`A cash session is already open for ${date}`);
    this.name = 'SessionAlreadyOpenError';
  }
}

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), review round 2 R2. Thrown by
 * cash-movement recording/reversal when there is no currently-open
 * session (`getOpenSession()` returns null) — same typed-error shape as
 * SessionAlreadyOpenError, never a raw constraint error crossing the
 * IPC boundary.
 */
export class CashSessionNotOpenError extends Error {
  readonly code = 'CASH_SESSION_NOT_OPEN';

  constructor() {
    super('No cash session is currently open.');
    this.name = 'CashSessionNotOpenError';
  }
}

export interface CashSessionRepositoryPort {
  /**
   * ONE TRANSACTION: cash_session insert + audit_log + sync_outbox.
   * Throws SessionAlreadyOpenError (never a raw constraint error) if a
   * session already exists for this date.
   */
  openSession(input: OpenSessionRepoInput): Promise<CashSessionRecord>;
  /**
   * ONE TRANSACTION: computes expected_cash from that date's confirmed
   * sales/purchases/expenses/payments (all COALESCE'd to 0), then a real
   * UPDATE on the existing row (cash_session is NOT append-only —
   * PHASE_7.md §5 Correction 2) + audit_log + sync_outbox.
   */
  closeSession(input: CloseSessionRepoInput): Promise<CashSessionRecord>;
  /** The session for one date, or null if none was opened. */
  getSessionByDate(date: string): Promise<CashSessionRecord | null>;
  /**
   * Phase 17.5, review round 3 R6/R7 — the session with
   * `closed_at IS NULL`, regardless of what today's wall-clock date is.
   * This is deliberately NOT `getSessionByDate(todayIso())`: a session
   * opened on day D and never closed must still be found on wall-clock
   * D+1 — that's the whole point (BUG-33, PROJECT.md, not fixed by
   * this method — `cash_movement` uses it to avoid the same defect for
   * its own writes, nothing more). Null if no session is open at all.
   */
  getOpenSession(): Promise<CashSessionRecord | null>;
}
