import { ipcMain } from 'electron';
import {
  GetMonthAttendanceInput,
  SaveAttendanceInput,
  type AttendanceRecordDto,
} from '@shop/contracts';
import { saveAttendanceBatch } from '@shop/core';
import { createKyselyDb, KyselyAttendanceRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface AttendanceHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See staff.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerAttendanceHandlers(deps: AttendanceHandlerDeps): void {
  ipcMain.handle(
    channels.staff.saveAttendance,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SaveAttendanceInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyAttendanceRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        await saveAttendanceBatch(
          repo,
          input.rows.map((row) => ({
            staffId: row.staffId,
            date: row.date,
            status: row.status,
            wageRatePaisa: row.wageRatePaisa,
            staffRole: row.staffRole,
          })),
        );
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.staff.getMonthAttendance,
    withError(async (_event, raw: unknown): Promise<readonly AttendanceRecordDto[]> => {
      const input = GetMonthAttendanceInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyAttendanceRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        const rows = await repo.getMonthAttendance(input.year, input.month);
        return rows.map((row): AttendanceRecordDto => ({
          id: row.id,
          staffId: row.staffId,
          attendanceDate: row.attendanceDate,
          status: row.status,
          wageEarnedPaisa: row.wageEarnedPaisa,
          businessUnitId: row.businessUnitId,
        }));
      } finally {
        db.close();
      }
    }),
  );
}
