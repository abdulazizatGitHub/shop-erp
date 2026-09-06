import type { AttendanceStatus } from '@shop/contracts';
import { computeDayWage } from './wage.service.js';
import type {
  AttendanceRepositoryPort,
  BusinessUnitCode,
  SaveAttendanceBatchRow,
} from './attendance.repository.port.js';

export type StaffRoleForAttendance = 'technician' | 'salesman' | 'helper' | null;

export interface AttendanceInputRow {
  readonly staffId: string;
  readonly date: string;
  readonly status: AttendanceStatus;
  /** Snapshot from staff:listStaff — the handler supplies it, the service never re-fetches it (matches deliverJob's price-snapshot pattern). */
  readonly wageRatePaisa: number;
  readonly staffRole: StaffRoleForAttendance;
}

/**
 * PHASE_7.md §5 Correction C — the ONLY place staffRole -> business unit
 * derivation happens. Pure, no DB access: this returns a business_unit
 * CODE, which the db-layer repository resolves to an id inside its own
 * transaction (see attendance.repository.port.ts's file header for why).
 */
export function deriveBusinessUnitCode(staffRole: StaffRoleForAttendance): BusinessUnitCode {
  if (staffRole === 'technician') return 'REPAIR';
  if (staffRole === 'salesman') return 'PARTS';
  return 'SHARED';
}

/**
 * Pure orchestration — no DB import (packages/core/src/job/job.service.ts's
 * plain-exported-function pattern, not a class). Computes wage_earned via
 * wage.service.ts and derives business_unit_id (as a code) via
 * deriveBusinessUnitCode, then hands the whole batch to the repository in
 * one call so it can write it in one transaction.
 */
export async function saveAttendanceBatch(
  repo: AttendanceRepositoryPort,
  rows: readonly AttendanceInputRow[],
): Promise<void> {
  const batchRows: SaveAttendanceBatchRow[] = rows.map((row) => ({
    staffId: row.staffId,
    attendanceDate: row.date,
    status: row.status,
    wageEarnedPaisa: computeDayWage(row.status, row.wageRatePaisa),
    businessUnitCode: deriveBusinessUnitCode(row.staffRole),
  }));

  await repo.saveBatch({ rows: batchRows });
}
