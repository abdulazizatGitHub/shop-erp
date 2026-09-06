import type { AttendanceStatus } from '@shop/contracts';

/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db (docs/ARCHITECTURE.md §2).
 *
 * Deliberately colocated in packages/core/src/payroll/, not a shared
 * packages/core/src/ports/ folder — every existing port in this codebase
 * (job.repository.port.ts, party.repository.port.ts, ...) lives next to
 * its domain's service file, and this follows that same convention
 * rather than introducing a new top-level structure.
 */

/** PARTS | REPAIR | SHARED — the three fixed business_unit.code values (ADR-0010). */
export type BusinessUnitCode = 'PARTS' | 'REPAIR' | 'SHARED';

/**
 * businessUnitCode, not businessUnitId — the actual code->id lookup
 * happens inside the repository's own transaction (KyselyAttendanceRepository),
 * matching the established pattern already used by
 * internal-transfer.repository.ts and job.repository.ts (both resolve
 * business_unit.code -> id via a `selectFrom('businessUnit')` query
 * inside their own transaction, never pre-resolved by the pure core
 * service). Keeping the core service pure — no DB import — this port
 * carries the code, and only the db-layer implementation ever sees an id.
 */
export interface SaveAttendanceBatchRow {
  readonly staffId: string;
  readonly attendanceDate: string;
  readonly status: AttendanceStatus;
  readonly wageEarnedPaisa: number;
  readonly businessUnitCode: BusinessUnitCode;
}

export interface SaveAttendanceBatchInput {
  readonly rows: readonly SaveAttendanceBatchRow[];
}

export interface AttendanceRecord {
  readonly id: string;
  readonly staffId: string;
  readonly attendanceDate: string;
  readonly status: AttendanceStatus;
  readonly wageEarnedPaisa: number;
  readonly businessUnitId: string;
}

export interface AttendanceRepositoryPort {
  /**
   * Upsert semantics on (tenant_id, staff_id, attendance_date) — an
   * explicit, documented exception to the append-only rule (PHASE_7.md
   * §5 Correction 1 / DC-2 in DATABASE_RULES terms: attendance has no
   * financial consequence of its own until wage_earned is snapshotted
   * here, so replacing a day's row carries no audit-trail loss the way
   * overwriting a stock_movement or party_ledger row would).
   * ONE TRANSACTION for the whole batch — all rows succeed or none do.
   */
  saveBatch(input: SaveAttendanceBatchInput): Promise<void>;
  /** All rows for the given tenant/year/month, across all staff. */
  getMonthAttendance(year: number, month: number): Promise<readonly AttendanceRecord[]>;
}
