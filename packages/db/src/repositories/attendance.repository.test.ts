import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveAttendanceBatch } from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyAttendanceRepository } from './attendance.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let partyRepo: KyselyPartyRepository;
let repo: KyselyAttendanceRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-attendance-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
  repo = new KyselyAttendanceRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

async function makeStaff(
  role: 'technician' | 'salesman' | 'helper',
  wageRatePaisa: number,
): Promise<{ id: string }> {
  const result = await partyRepo.createStaff({
    name: `Staff ${role}`,
    phone: '0300',
    staffRole: role,
    wageRatePaisa,
    commissionBp: 0,
  });
  return { id: result.id };
}

describe('KyselyAttendanceRepository.saveBatch / getMonthAttendance (PHASE_7.md §5, EC-P7-1/EC-P7-2)', () => {
  it('saves a batch of 3 rows for 3 different staff on the same date', async () => {
    const technician = await makeStaff('technician', 60000);
    const salesman = await makeStaff('salesman', 50000);
    const helper = await makeStaff('helper', 40000);

    await saveAttendanceBatch(repo, [
      {
        staffId: technician.id,
        date: '2026-08-01',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: salesman.id,
        date: '2026-08-01',
        status: 'half_day',
        wageRatePaisa: 50000,
        staffRole: 'salesman',
      },
      {
        staffId: helper.id,
        date: '2026-08-01',
        status: 'absent',
        wageRatePaisa: 40000,
        staffRole: 'helper',
      },
    ]);

    const rows = rawDb
      .prepare(
        `SELECT staff_id, status, wage_earned, business_unit_id FROM attendance
         WHERE tenant_id = ? ORDER BY wage_earned DESC`,
      )
      .all(TENANT_ID) as Array<{
      staff_id: string;
      status: string;
      wage_earned: number;
      business_unit_id: string;
    }>;

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      staff_id: technician.id,
      status: 'present',
      wage_earned: 60000,
    });
    expect(rows[1]).toMatchObject({
      staff_id: salesman.id,
      status: 'half_day',
      wage_earned: 25000,
    });
    expect(rows[2]).toMatchObject({ staff_id: helper.id, status: 'absent', wage_earned: 0 });
  });

  it('upsert: saving the same (staff, date) a second time replaces, not appends', async () => {
    const staff = await makeStaff('technician', 60000);

    await saveAttendanceBatch(repo, [
      {
        staffId: staff.id,
        date: '2026-08-05',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
    ]);
    await saveAttendanceBatch(repo, [
      {
        staffId: staff.id,
        date: '2026-08-05',
        status: 'absent',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
    ]);

    const rows = rawDb
      .prepare(
        `SELECT status, wage_earned FROM attendance
         WHERE tenant_id = ? AND staff_id = ? AND attendance_date = ?`,
      )
      .all(TENANT_ID, staff.id, '2026-08-05') as Array<{ status: string; wage_earned: number }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ status: 'absent', wage_earned: 0 });
  });

  it('business_unit_id is derived correctly from staff_role — joined by business_unit.code, never by asserting a UUID', async () => {
    const technician = await makeStaff('technician', 60000);
    const salesman = await makeStaff('salesman', 50000);
    const helper = await makeStaff('helper', 40000);

    await saveAttendanceBatch(repo, [
      {
        staffId: technician.id,
        date: '2026-08-06',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: salesman.id,
        date: '2026-08-06',
        status: 'present',
        wageRatePaisa: 50000,
        staffRole: 'salesman',
      },
      {
        staffId: helper.id,
        date: '2026-08-06',
        status: 'present',
        wageRatePaisa: 40000,
        staffRole: 'helper',
      },
    ]);

    const rows = rawDb
      .prepare(
        `SELECT a.staff_id, bu.code AS unit_code
         FROM attendance a JOIN business_unit bu ON bu.id = a.business_unit_id
         WHERE a.tenant_id = ? AND a.attendance_date = ?`,
      )
      .all(TENANT_ID, '2026-08-06') as Array<{ staff_id: string; unit_code: string }>;

    const byStaffId = new Map(rows.map((r) => [r.staff_id, r.unit_code]));
    expect(byStaffId.get(technician.id)).toBe('REPAIR');
    expect(byStaffId.get(salesman.id)).toBe('PARTS');
    expect(byStaffId.get(helper.id)).toBe('SHARED');
  });

  it('wage_earned stored correctly per status at Rs 600/day (wageRatePaisa = 60000)', async () => {
    const staff = await makeStaff('technician', 60000);

    // present  = 60000
    // half_day = floor(60000 / 2) = 30000
    // absent   = 0
    // leave    = 0
    // holiday  = 60000
    await saveAttendanceBatch(repo, [
      {
        staffId: staff.id,
        date: '2026-08-10',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: staff.id,
        date: '2026-08-11',
        status: 'half_day',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: staff.id,
        date: '2026-08-12',
        status: 'absent',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: staff.id,
        date: '2026-08-13',
        status: 'leave',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: staff.id,
        date: '2026-08-14',
        status: 'holiday',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
    ]);

    const rows = rawDb
      .prepare(
        `SELECT attendance_date, status, wage_earned FROM attendance
         WHERE tenant_id = ? AND staff_id = ? ORDER BY attendance_date`,
      )
      .all(TENANT_ID, staff.id) as Array<{
      attendance_date: string;
      status: string;
      wage_earned: number;
    }>;

    expect(rows).toEqual([
      { attendance_date: '2026-08-10', status: 'present', wage_earned: 60000 },
      { attendance_date: '2026-08-11', status: 'half_day', wage_earned: 30000 },
      { attendance_date: '2026-08-12', status: 'absent', wage_earned: 0 },
      { attendance_date: '2026-08-13', status: 'leave', wage_earned: 0 },
      { attendance_date: '2026-08-14', status: 'holiday', wage_earned: 60000 },
    ]);
  });

  it('getMonthAttendance returns only rows for the requested month', async () => {
    const staff = await makeStaff('technician', 60000);

    await saveAttendanceBatch(repo, [
      {
        staffId: staff.id,
        date: '2026-08-30',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: staff.id,
        date: '2026-08-31',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: staff.id,
        date: '2026-09-01',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
    ]);

    const augustRows = await repo.getMonthAttendance(2026, 8);

    expect(augustRows).toHaveLength(2);
    expect(augustRows.map((r) => r.attendanceDate).sort()).toEqual(['2026-08-30', '2026-08-31']);
  });

  it('EC-P7-2 reconciliation: 22 present + 3 half_day + 5 absent at Rs 600/day sums to 1,410,000 paisa', async () => {
    const staff = await makeStaff('technician', 60000);
    const rowsToSave: Array<{
      staffId: string;
      date: string;
      status: 'present' | 'half_day' | 'absent';
      wageRatePaisa: number;
      staffRole: 'technician';
    }> = [];

    let day = 1;
    for (let i = 0; i < 22; i += 1, day += 1) {
      rowsToSave.push({
        staffId: staff.id,
        date: `2026-08-${String(day).padStart(2, '0')}`,
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      });
    }
    for (let i = 0; i < 3; i += 1, day += 1) {
      rowsToSave.push({
        staffId: staff.id,
        date: `2026-08-${String(day).padStart(2, '0')}`,
        status: 'half_day',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      });
    }
    for (let i = 0; i < 5; i += 1, day += 1) {
      rowsToSave.push({
        staffId: staff.id,
        date: `2026-08-${String(day).padStart(2, '0')}`,
        status: 'absent',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      });
    }
    expect(day - 1).toBe(30); // 22 + 3 + 5 = 30 days, fits within August

    await saveAttendanceBatch(repo, rowsToSave);

    // Hand-calc: (22 + 3 x 0.5) x 60000 = (22 + 1.5) x 60000 = 23.5 x 60000
    //          = 1,410,000 paisa = Rs 14,100.
    const sumRow = rawDb
      .prepare(
        `SELECT SUM(wage_earned) AS total FROM attendance WHERE tenant_id = ? AND staff_id = ?`,
      )
      .get(TENANT_ID, staff.id) as { total: number };

    expect(sumRow.total).toBe(1_410_000);
  });
});
