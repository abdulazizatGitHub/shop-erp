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
});

/**
 * Phase 7's KyselyCommissionRepository.recordCommission is retired
 * (P16-3a Checkpoint 2, ADR-0015) — commission is now a claim/decision,
 * not a direct ledger write. These tests only exercise
 * getWageMonthReport's own aggregation over party_ledger, so a direct
 * insert of the same shape recordCommission used to produce (one
 * entry_type='commission' row, amount negative) is equivalent and
 * simpler than standing up a full claim+decision fixture for every case.
 */
function insertCommissionLedgerRow(
  technicianId: string,
  commissionPaisa: number,
  entryDate: string,
): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, source_type, source_id, created_at)
       VALUES (?, ?, ?, ?, 'commission', ?, 'commission_decision', ?, ?)`,
    )
    .run(newId(), TENANT_ID, technicianId, entryDate, -commissionPaisa, newId(), now);
}

/** The clawback half of a reversal (OD-16-3a) — amount POSITIVE, opposite sign from the approval row it reverses. */
function insertCommissionReversalLedgerRow(
  technicianId: string,
  commissionPaisa: number,
  entryDate: string,
): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, source_type, source_id, created_at)
       VALUES (?, ?, ?, ?, 'commission', ?, 'commission_decision', ?, ?)`,
    )
    .run(newId(), TENANT_ID, technicianId, entryDate, commissionPaisa, newId(), now);
}

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

/** Seeds `presentDays` 'present' rows then `halfDays` 'half_day' rows, days 1..N of `yearMonth` (default 2026-08). */
async function seedAttendance(
  staffId: string,
  staffRole: 'technician' | 'salesman' | 'helper',
  wageRatePaisa: number,
  presentDays: number,
  halfDays: number,
  yearMonth = '2026-08',
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
      date: `${yearMonth}-${String(day).padStart(2, '0')}`,
      status: 'present',
      wageRatePaisa,
      staffRole,
    });
  }
  for (let i = 0; i < halfDays; i += 1, day += 1) {
    rows.push({
      staffId,
      date: `${yearMonth}-${String(day).padStart(2, '0')}`,
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
    insertCommissionLedgerRow(staffA.id, 24000, '2026-08-15');
    // Staff B: commissionBp=0 on their party row, but a commission row
    // can still exist (posted from a different path) — proves the
    // report reads party_ledger, not party.commission_bp.
    insertCommissionLedgerRow(staffB.id, 48000, '2026-08-20');

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
    insertCommissionLedgerRow(staffA.id, 24000, '2026-08-15');
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

describe('getWageMonthReport — FIX-1 sign fix (P16-3b, OD-16-4, ADR-0015)', () => {
  it('approved Sep-28, reversed Oct-2: September commissionPaisa = +50000, October commissionPaisa = -50000, October netPaisa is 50000 lower than a month with no ledger activity', async () => {
    const staffX = await partyRepo.createStaff({
      name: 'Staff X',
      phone: '0304',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 0,
    });
    await seedAttendance(staffX.id, 'technician', 60000, 20, 0, '2026-09');
    await seedAttendance(staffX.id, 'technician', 60000, 20, 0, '2026-10');
    insertCommissionLedgerRow(staffX.id, 50000, '2026-09-28');
    insertCommissionReversalLedgerRow(staffX.id, 50000, '2026-10-02');

    const septRows = await getWageMonthReport(kysely, TENANT_ID, 2026, 9);
    const octRows = await getWageMonthReport(kysely, TENANT_ID, 2026, 10);
    const septX = septRows.find((r) => r.staffId === staffX.id);
    const octX = octRows.find((r) => r.staffId === staffX.id);

    // Hand-calc: gross = 20 x 60000 = 1,200,000 for each month (identical
    // attendance both months, isolating the commission term).
    expect(septX?.commissionPaisa).toBe(50000);
    expect(septX?.netPaisa).toBe(1_200_000 + 50000);

    expect(octX?.commissionPaisa).toBe(-50000);
    // "50000 lower than a month with no ledger activity": with zero
    // commission, netPaisa would be exactly grossPaisa (1,200,000, no
    // advances this month either) — the clawback reduces it by 50000.
    expect(octX?.netPaisa).toBe(1_200_000 - 50000);
  });

  it('approve and reverse within the SAME month -> commissionPaisa = 0 for that technician (both rows fall in the same strftime bucket and net to zero)', async () => {
    const staffY = await partyRepo.createStaff({
      name: 'Staff Y',
      phone: '0305',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 0,
    });
    await seedAttendance(staffY.id, 'technician', 60000, 15, 0, '2026-11');
    insertCommissionLedgerRow(staffY.id, 50000, '2026-11-05');
    insertCommissionReversalLedgerRow(staffY.id, 50000, '2026-11-06');

    const rows = await getWageMonthReport(kysely, TENANT_ID, 2026, 11);
    const rowY = rows.find((r) => r.staffId === staffY.id);

    expect(rowY?.commissionPaisa).toBe(0);
    // gross = 15 x 60000 = 900,000; net unaffected by a fully-netted month.
    expect(rowY?.netPaisa).toBe(900_000);
  });

  it('delivered Sep-30, approved Oct-2 -> counted in October, not September (OD-16-4: attribution is by decision/entry_date, not delivery date)', async () => {
    const staffZ = await partyRepo.createStaff({
      name: 'Staff Z',
      phone: '0306',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 0,
    });
    await seedAttendance(staffZ.id, 'technician', 60000, 10, 0, '2026-09');
    await seedAttendance(staffZ.id, 'technician', 60000, 10, 0, '2026-10');
    // The delivery itself (creating the commission_claim) happened
    // 2026-09-30 in this scenario, but no party_ledger row exists until
    // the owner actually approves — entry_date is the approval date.
    insertCommissionLedgerRow(staffZ.id, 40000, '2026-10-02');

    const septRows = await getWageMonthReport(kysely, TENANT_ID, 2026, 9);
    const octRows = await getWageMonthReport(kysely, TENANT_ID, 2026, 10);
    const septZ = septRows.find((r) => r.staffId === staffZ.id);
    const octZ = octRows.find((r) => r.staffId === staffZ.id);

    expect(septZ?.commissionPaisa).toBe(0);
    expect(octZ?.commissionPaisa).toBe(40000);
  });
});
