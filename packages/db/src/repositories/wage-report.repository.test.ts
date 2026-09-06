import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { saveAttendanceBatch } from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyAttendanceRepository } from './attendance.repository.js';
import { KyselyAdvanceRepository } from './advance.repository.js';
import { KyselyCommissionRepository } from './commission.repository.js';
import { getWageMonthReport } from './wage-report.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let partyRepo: KyselyPartyRepository;
let attendanceRepo: KyselyAttendanceRepository;
let advanceRepo: KyselyAdvanceRepository;
let commissionRepo: KyselyCommissionRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-wage-report-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  kysely = createKyselyDb(rawDb);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
  attendanceRepo = new KyselyAttendanceRepository(kysely, TENANT_ID, DEVICE_CODE);
  advanceRepo = new KyselyAdvanceRepository(kysely, TENANT_ID, DEVICE_CODE);
  commissionRepo = new KyselyCommissionRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

/** Seeds `presentDays` 'present' rows then `halfDays` 'half_day' rows, days 1..N of 2026-08. */
async function seedAttendance(
  staffId: string,
  staffRole: 'technician' | 'salesman' | 'helper',
  wageRatePaisa: number,
  presentDays: number,
  halfDays: number,
): Promise<void> {
  const rows: Array<{
    staffId: string;
    date: string;
    status: 'present' | 'half_day';
    wageRatePaisa: number;
    staffRole: 'technician' | 'salesman' | 'helper';
  }> = [];
  let day = 1;
  for (let i = 0; i < presentDays; i += 1, day += 1) {
    rows.push({
      staffId,
      date: `2026-08-${String(day).padStart(2, '0')}`,
      status: 'present',
      wageRatePaisa,
      staffRole,
    });
  }
  for (let i = 0; i < halfDays; i += 1, day += 1) {
    rows.push({
      staffId,
      date: `2026-08-${String(day).padStart(2, '0')}`,
      status: 'half_day',
      wageRatePaisa,
      staffRole,
    });
  }
  await saveAttendanceBatch(attendanceRepo, rows);
}

describe('getWageMonthReport (PHASE_7.md §5, EC-P7-7)', () => {
  it('EC-P7-7: Staff A and Staff B scenario — exact paisa values', async () => {
    const staffA = await partyRepo.createStaff({
      name: 'Staff A',
      phone: '0300',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 1000,
    });
    const staffB = await partyRepo.createStaff({
      name: 'Staff B',
      phone: '0301',
      staffRole: 'salesman',
      wageRatePaisa: 80000,
      commissionBp: 0,
    });

    await seedAttendance(staffA.id, 'technician', 60000, 22, 2);
    await seedAttendance(staffB.id, 'salesman', 80000, 26, 0);

    await advanceRepo.recordAdvance({
      staffId: staffA.id,
      date: '2026-08-10',
      amountPaisa: 300000,
      notes: null,
    });
    await commissionRepo.recordCommission({
      technicianId: staffA.id,
      jobId: newId(),
      commissionPaisa: 24000,
      deliveryDate: '2026-08-15',
    });
    // Staff B: commissionBp=0 on their party row, but a commission row
    // can still exist (posted from a different path) — proves the
    // report reads party_ledger, not party.commission_bp.
    await commissionRepo.recordCommission({
      technicianId: staffB.id,
      jobId: newId(),
      commissionPaisa: 48000,
      deliveryDate: '2026-08-20',
    });

    // Hand-calc, written before calling getWageMonthReport:
    //   Staff A: gross = 22 x 60000 + 2 x 30000 = 1,320,000 + 60,000 = 1,380,000
    //            advances = 300,000
    //            commission = ABS(-24,000) = 24,000
    //            net = 1,380,000 - 300,000 + 24,000 = 1,104,000
    //   Staff B: gross = 26 x 80000 = 2,080,000
    //            advances = 0
    //            commission = ABS(-48,000) = 48,000
    //            net = 2,080,000 - 0 + 48,000 = 2,128,000
    const rows = await getWageMonthReport(kysely, TENANT_ID, 2026, 8);

    expect(rows).toHaveLength(2);

    const rowA = rows.find((r) => r.staffId === staffA.id);
    const rowB = rows.find((r) => r.staffId === staffB.id);

    expect(rowA).toEqual({
      staffId: staffA.id,
      staffName: 'Staff A',
      staffRole: 'technician',
      fullDays: 22,
      halfDays: 2,
      absentDays: 0,
      leaveDays: 0,
      holidayDays: 0,
      grossPaisa: 1_380_000,
      advancesPaisa: 300_000,
      commissionPaisa: 24_000,
      netPaisa: 1_104_000,
    });

    expect(rowB).toEqual({
      staffId: staffB.id,
      staffName: 'Staff B',
      staffRole: 'salesman',
      fullDays: 26,
      halfDays: 0,
      absentDays: 0,
      leaveDays: 0,
      holidayDays: 0,
      grossPaisa: 2_080_000,
      advancesPaisa: 0,
      commissionPaisa: 48_000,
      netPaisa: 2_128_000,
    });
  });

  it('staff with no attendance this month are not returned', async () => {
    const staffC = await partyRepo.createStaff({
      name: 'Staff C',
      phone: '0302',
      staffRole: 'helper',
      wageRatePaisa: 40000,
      commissionBp: 0,
    });
    // No attendance rows for staffC at all.

    const rows = await getWageMonthReport(kysely, TENANT_ID, 2026, 8);

    expect(rows.find((r) => r.staffId === staffC.id)).toBeUndefined();
  });

  it('zero advances and zero commission produce correct net', async () => {
    const staffD = await partyRepo.createStaff({
      name: 'Staff D',
      phone: '0303',
      staffRole: 'helper',
      wageRatePaisa: 50000,
      commissionBp: 0,
    });
    await seedAttendance(staffD.id, 'helper', 50000, 10, 0);

    // Hand-calc: gross = 10 x 50000 = 500,000. net = 500,000 - 0 + 0 = 500,000.
    const rows = await getWageMonthReport(kysely, TENANT_ID, 2026, 8);
    const rowD = rows.find((r) => r.staffId === staffD.id);

    expect(rowD).toMatchObject({
      grossPaisa: 500_000,
      advancesPaisa: 0,
      commissionPaisa: 0,
      netPaisa: 500_000,
    });
  });

  it("previous month's advances do not bleed into this month's report", async () => {
    const staffA = await partyRepo.createStaff({
      name: 'Staff A',
      phone: '0300',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 1000,
    });
    await seedAttendance(staffA.id, 'technician', 60000, 22, 2);
    await advanceRepo.recordAdvance({
      staffId: staffA.id,
      date: '2026-08-10',
      amountPaisa: 300000,
      notes: null,
    });
    await commissionRepo.recordCommission({
      technicianId: staffA.id,
      jobId: newId(),
      commissionPaisa: 24000,
      deliveryDate: '2026-08-15',
    });
    // A prior-month advance that must NOT be included in August's report.
    await advanceRepo.recordAdvance({
      staffId: staffA.id,
      date: '2026-07-20',
      amountPaisa: 999999,
      notes: null,
    });

    const rows = await getWageMonthReport(kysely, TENANT_ID, 2026, 8);
    const rowA = rows.find((r) => r.staffId === staffA.id);

    // Same expected values as the EC-P7-7 test — the July advance must
    // not change August's advancesPaisa or netPaisa.
    expect(rowA?.advancesPaisa).toBe(300_000);
    expect(rowA?.netPaisa).toBe(1_104_000);
  });
});
