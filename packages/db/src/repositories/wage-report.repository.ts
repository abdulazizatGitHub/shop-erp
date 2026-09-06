import { sql, type Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

/**
 * P7-7. Deliberately a plain exported function, not a port/service pair
 * — report.repository.ts (R1-R5) is the established precedent for every
 * report in this codebase: plain `(db, tenantId, ...) => Promise<...>`
 * functions, called directly from report.handler.ts, no
 * ReportRepositoryPort exists anywhere. docs/SYSTEM_DESIGN.md §7:
 * reports read from SQL aggregation directly, never re-derived in
 * TypeScript — the same reasoning applies here, not just to view-backed
 * reports. Matching that convention rather than introducing the one
 * port/service layer no other report in this codebase has.
 */
export interface WageMonthRow {
  readonly staffId: string;
  readonly staffName: string;
  readonly staffRole: string;
  readonly fullDays: number;
  readonly halfDays: number;
  readonly absentDays: number;
  readonly leaveDays: number;
  readonly holidayDays: number;
  readonly grossPaisa: number;
  readonly advancesPaisa: number;
  readonly commissionPaisa: number;
  readonly netPaisa: number;
}

interface WageMonthQueryRow {
  staffId: string;
  staffName: string;
  staffRole: string | null;
  fullDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  grossPaisa: number;
  advancesPaisa: number;
  commissionPaisa: number;
  netPaisa: number;
}

/**
 * One row per staff member with at least one attendance row in the
 * requested month — a staff member with zero attendance rows that
 * month is simply absent from the result, never returned with all
 * fields zeroed.
 *
 * SUM(CASE WHEN status = 'x' THEN 1 ELSE 0 END) rather than SQLite's
 * FILTER clause — no FILTER usage exists anywhere in this codebase;
 * 0012_job_split_v2.sql's v_job_split view uses this exact
 * CASE/SUM(CASE WHEN) idiom for the same kind of conditional
 * aggregation, so this follows that live precedent.
 *
 * advances/commission are computed via correlated subqueries against
 * party_ledger, scoped to the same year/month — a LEFT JOIN would
 * double-count the attendance aggregation once per matching ledger row,
 * so subqueries (each collapsing to one scalar per staff row) are
 * correct here, not an accidental complexity.
 */
export async function getWageMonthReport(
  db: Kysely<Database>,
  tenantId: string,
  year: number,
  month: number,
): Promise<readonly WageMonthRow[]> {
  const yearStr = String(year).padStart(4, '0');
  const monthStr = String(month).padStart(2, '0');

  const result = await sql<WageMonthQueryRow>`
    SELECT
      p.id                                                              AS staffId,
      p.name                                                            AS staffName,
      p.staff_role                                                      AS staffRole,
      SUM(CASE WHEN a.status = 'present'  THEN 1 ELSE 0 END)            AS fullDays,
      SUM(CASE WHEN a.status = 'half_day' THEN 1 ELSE 0 END)            AS halfDays,
      SUM(CASE WHEN a.status = 'absent'   THEN 1 ELSE 0 END)            AS absentDays,
      SUM(CASE WHEN a.status = 'leave'    THEN 1 ELSE 0 END)            AS leaveDays,
      SUM(CASE WHEN a.status = 'holiday'  THEN 1 ELSE 0 END)            AS holidayDays,
      SUM(a.wage_earned)                                                AS grossPaisa,
      COALESCE((
        SELECT SUM(pl.amount) FROM party_ledger pl
        WHERE pl.tenant_id = ${tenantId} AND pl.party_id = p.id
          AND pl.entry_type = 'advance'
          AND strftime('%Y', pl.entry_date) = ${yearStr}
          AND strftime('%m', pl.entry_date) = ${monthStr}
      ), 0)                                                             AS advancesPaisa,
      COALESCE(ABS((
        SELECT SUM(pl.amount) FROM party_ledger pl
        WHERE pl.tenant_id = ${tenantId} AND pl.party_id = p.id
          AND pl.entry_type = 'commission'
          AND strftime('%Y', pl.entry_date) = ${yearStr}
          AND strftime('%m', pl.entry_date) = ${monthStr}
      )), 0)                                                            AS commissionPaisa,
      SUM(a.wage_earned)
        - COALESCE((
            SELECT SUM(pl.amount) FROM party_ledger pl
            WHERE pl.tenant_id = ${tenantId} AND pl.party_id = p.id
              AND pl.entry_type = 'advance'
              AND strftime('%Y', pl.entry_date) = ${yearStr}
              AND strftime('%m', pl.entry_date) = ${monthStr}
          ), 0)
        + COALESCE(ABS((
            SELECT SUM(pl.amount) FROM party_ledger pl
            WHERE pl.tenant_id = ${tenantId} AND pl.party_id = p.id
              AND pl.entry_type = 'commission'
              AND strftime('%Y', pl.entry_date) = ${yearStr}
              AND strftime('%m', pl.entry_date) = ${monthStr}
          )), 0)                                                        AS netPaisa
    FROM party p
    JOIN attendance a ON a.staff_id = p.id AND a.tenant_id = p.tenant_id
    WHERE p.tenant_id = ${tenantId}
      AND p.party_type = 'staff'
      AND strftime('%Y', a.attendance_date) = ${yearStr}
      AND strftime('%m', a.attendance_date) = ${monthStr}
    GROUP BY p.id, p.name, p.staff_role
    ORDER BY p.name ASC
  `.execute(db);

  return result.rows.map((row): WageMonthRow => ({
    staffId: row.staffId,
    staffName: row.staffName,
    staffRole: row.staffRole ?? '',
    fullDays: row.fullDays,
    halfDays: row.halfDays,
    absentDays: row.absentDays,
    leaveDays: row.leaveDays,
    holidayDays: row.holidayDays,
    grossPaisa: row.grossPaisa,
    advancesPaisa: row.advancesPaisa,
    commissionPaisa: row.commissionPaisa,
    netPaisa: row.netPaisa,
  }));
}
