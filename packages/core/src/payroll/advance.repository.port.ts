/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Colocated in packages/core/src/payroll/, same as
 * attendance.repository.port.ts (P7-1) — not a new packages/core/src/ports/
 * folder, following the convention every existing port in this codebase
 * already uses (colocated with its domain's service file).
 *
 * tenantId is NOT a parameter on these methods, unlike the P7-3 brief's
 * draft — every existing repository in this codebase (KyselyPartyRepository,
 * KyselyPaymentRepository, KyselyAttendanceRepository from P7-1, ...)
 * takes tenantId once, at construction time, never per call. Matching
 * that precedent again, per your note that following live precedent over
 * the brief's options is the right call every time.
 */

export interface RecordAdvanceRepoInput {
  readonly staffId: string;
  readonly date: string;
  readonly amountPaisa: number;
  readonly notes: string | null;
}

export interface AdvanceRecord {
  readonly id: string;
  readonly staffId: string;
  readonly staffName: string;
  readonly date: string;
  readonly amountPaisa: number;
  readonly docNo: string;
  readonly notes: string | null;
}

export interface ListAdvancesRepoInput {
  readonly staffId: string;
  readonly year: number;
  readonly month: number;
}

export interface AdvanceRepositoryPort {
  /**
   * ONE TRANSACTION: party_ledger (entry_type='advance', amount=+ve —
   * PHASE_7.md §5 GAP-4) + payment (direction='out', method='cash',
   * doc_no=PMT-NNNN) + audit_log + sync_outbox. Write path — must be
   * wrapped in withRetry (PROJECT.md BUG-15), same as every other
   * multi-table write in this codebase.
   */
  recordAdvance(input: RecordAdvanceRepoInput): Promise<AdvanceRecord>;
  /** party_ledger rows WHERE entry_type='advance' for one staff member/month. */
  listAdvances(input: ListAdvancesRepoInput): Promise<readonly AdvanceRecord[]>;
}
