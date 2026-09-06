import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type {
  AttendanceRecord,
  AttendanceRepositoryPort,
  AttendanceStatus,
  SaveAttendanceBatchInput,
} from '@shop/core';
import type { Database } from '../kysely-schema.js';

const ATTENDANCE_COLUMNS = [
  'attendance.id',
  'attendance.staffId',
  'attendance.attendanceDate',
  'attendance.status',
  'attendance.wageEarned',
  'attendance.businessUnitId',
] as const;

export class KyselyAttendanceRepository implements AttendanceRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  /**
   * Upsert on (tenant_id, staff_id, attendance_date) via Kysely's
   * .onConflict().doUpdateSet() — the same idiom setting.repository.ts
   * already uses for its (tenantId, key) upsert. This keeps the
   * original row's id on a repeat save (no delete+reinsert), which is
   * moot for FK integrity here anyway — confirmed by grep that no table
   * in this schema has a foreign key to attendance.id.
   *
   * business_unit.code -> id resolution happens here, inside this
   * transaction, matching internal-transfer.repository.ts and
   * job.repository.ts's established pattern — never pre-resolved in the
   * pure core service.
   *
   * ONE audit_log row per batch, not per row — record_id is the
   * attendance_date the batch covers (audit_log.record_id carries no FK
   * constraint, so this is a valid, meaningful choice for a save that
   * has no single parent document id).
   */
  async saveBatch(input: SaveAttendanceBatchInput): Promise<void> {
    if (input.rows.length === 0) return;

    await this.db.transaction().execute(async (trx) => {
      const unitRows = await trx
        .selectFrom('businessUnit')
        .select(['code', 'id'])
        .where('tenantId', '=', this.tenantId)
        .execute();
      const unitIdByCode = new Map<string, string>(unitRows.map((u) => [u.code, u.id]));

      const now = new Date().toISOString();

      for (const row of input.rows) {
        const businessUnitId = unitIdByCode.get(row.businessUnitCode);
        if (!businessUnitId) {
          throw new Error(
            `Business unit ${row.businessUnitCode} not found for tenant ${this.tenantId} — has the seed run?`,
          );
        }

        await trx
          .insertInto('attendance')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            staffId: row.staffId,
            attendanceDate: row.attendanceDate,
            status: row.status,
            hoursWorked: null,
            overtimeHours: null,
            wageEarned: row.wageEarnedPaisa,
            note: null,
            createdAt: now,
            createdBy: null,
            businessUnitId,
          })
          .onConflict((oc) =>
            oc.columns(['tenantId', 'staffId', 'attendanceDate']).doUpdateSet({
              status: row.status,
              wageEarned: row.wageEarnedPaisa,
              businessUnitId,
            }),
          )
          .execute();
      }

      const batchDate = input.rows[0]?.attendanceDate ?? null;
      await trx
        .insertInto('auditLog')
        .values({
          id: newId(),
          tenantId: this.tenantId,
          tableName: 'attendance',
          recordId: batchDate ?? 'unknown-date',
          action: 'insert',
          changedFields: JSON.stringify({ staffCount: input.rows.length }),
          oldValues: null,
          userId: null,
          deviceCode: this.deviceCode,
          createdAt: now,
        })
        .execute();
    });
  }

  /**
   * attendance_date is stored as 'YYYY-MM-DD' text (0001_init.sql) — a
   * LIKE prefix match on 'YYYY-MM-' is sufficient and avoids a raw
   * strftime() SQL fragment for a plain ISO date column.
   */
  async getMonthAttendance(year: number, month: number): Promise<readonly AttendanceRecord[]> {
    const monthPrefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`;

    const rows = await this.db
      .selectFrom('attendance')
      .select(ATTENDANCE_COLUMNS)
      .where('attendance.tenantId', '=', this.tenantId)
      .where('attendance.attendanceDate', 'like', `${monthPrefix}%`)
      .execute();

    return rows.map((row): AttendanceRecord => ({
      id: row.id,
      staffId: row.staffId,
      attendanceDate: row.attendanceDate,
      status: row.status as AttendanceStatus,
      wageEarnedPaisa: row.wageEarned,
      businessUnitId: row.businessUnitId ?? '',
    }));
  }
}
