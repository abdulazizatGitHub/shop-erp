import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyExpenseRepository } from './expense.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyExpenseRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-expense-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  // seed() already runs seedExpenseCategories() (P7-0) and seeds
  // PARTS/REPAIR/SHARED business units — confirmed by reading bootstrap.ts
  // before writing this file, per this session's instruction.
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyExpenseRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

function categoryId(name: string): string {
  const row = rawDb
    .prepare(`SELECT id FROM expense_category WHERE tenant_id = ? AND name = ?`)
    .get(TENANT_ID, name) as { id: string } | undefined;
  if (!row) throw new Error(`Category ${name} not found — did seed() run?`);
  return row.id;
}

function businessUnitId(code: string): string {
  const row = rawDb
    .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = ?`)
    .get(TENANT_ID, code) as { id: string } | undefined;
  if (!row) throw new Error(`Business unit ${code} not found — did seed() run?`);
  return row.id;
}

describe('KyselyExpenseRepository.createExpense (PHASE_7.md §5 Conflict 4/6, EC-P7-4)', () => {
  it('inserts correct row and returns ExpenseDto — Rs 4,500 -> 450000 paisa', async () => {
    const result = await repo.createExpense({
      categoryId: categoryId('Electricity'),
      expenseDate: '2026-08-15',
      amountPaisa: 450000,
      businessUnitId: businessUnitId('SHARED'),
      vehicle: null,
      method: 'cash',
      notes: null,
    });

    expect(result.businessUnitCode).toBe('SHARED');
    expect(result.docNo).toMatch(/^EXP-/);

    const row = rawDb.prepare(`SELECT * FROM expense WHERE id = ?`).get(result.id) as Record<
      string,
      unknown
    >;
    expect(row['amount']).toBe(450000);
    expect(row['business_unit_id']).toBe(businessUnitId('SHARED'));
    expect(row['method']).toBe('cash');
    expect((row['doc_no'] as string).startsWith('EXP-')).toBe(true);
  });

  it('method=owner_personal is accepted and stored', async () => {
    const result = await repo.createExpense({
      categoryId: categoryId('Courier'),
      expenseDate: '2026-08-15',
      amountPaisa: 20000,
      businessUnitId: businessUnitId('PARTS'),
      vehicle: null,
      method: 'owner_personal',
      notes: null,
    });

    const row = rawDb.prepare(`SELECT method FROM expense WHERE id = ?`).get(result.id) as {
      method: string;
    };
    expect(row.method).toBe('owner_personal');
  });

  it('listExpenses returns expenses within the date range only', async () => {
    await repo.createExpense({
      categoryId: categoryId('Petrol'),
      expenseDate: '2026-08-20',
      amountPaisa: 30000,
      businessUnitId: businessUnitId('REPAIR'),
      vehicle: null,
      method: 'cash',
      notes: null,
    });
    await repo.createExpense({
      categoryId: categoryId('Petrol'),
      expenseDate: '2026-09-05',
      amountPaisa: 30000,
      businessUnitId: businessUnitId('REPAIR'),
      vehicle: null,
      method: 'cash',
      notes: null,
    });

    const augustExpenses = await repo.listExpenses({ from: '2026-08-01', to: '2026-08-31' });

    expect(augustExpenses).toHaveLength(1);
    expect(augustExpenses[0]?.expenseDate).toBe('2026-08-20');
  });
});

describe('EC-P7-4: v_unit_direct_expense / v_overhead_pool', () => {
  // All three on the same expense_date — both views GROUP BY expense_date,
  // so this keeps each unit_code/allocation_method producing exactly one
  // row, confirmed by reading the view SQL before writing this test.
  const EXPENSE_DATE = '2026-08-15';

  beforeEach(async () => {
    // 1. Electricity Rs 4,500 -> 450000 paisa, SHARED, cash
    await repo.createExpense({
      categoryId: categoryId('Electricity'),
      expenseDate: EXPENSE_DATE,
      amountPaisa: 450000,
      businessUnitId: businessUnitId('SHARED'),
      vehicle: null,
      method: 'cash',
      notes: null,
    });
    // 2. Bike Fuel Rs 800 -> 80000 paisa, REPAIR, vehicle=NX-100, cash
    await repo.createExpense({
      categoryId: categoryId('Bike Fuel'),
      expenseDate: EXPENSE_DATE,
      amountPaisa: 80000,
      businessUnitId: businessUnitId('REPAIR'),
      vehicle: 'NX-100',
      method: 'cash',
      notes: null,
    });
    // 3. Courier Rs 200 -> 20000 paisa, PARTS, owner_personal
    await repo.createExpense({
      categoryId: categoryId('Courier'),
      expenseDate: EXPENSE_DATE,
      amountPaisa: 20000,
      businessUnitId: businessUnitId('PARTS'),
      vehicle: null,
      method: 'owner_personal',
      notes: null,
    });
  });

  it('v_unit_direct_expense: PARTS and REPAIR expenses appear, SHARED does not', () => {
    // Hand-calc: REPAIR = 800 x 100 = 80000 paisa. PARTS = 200 x 100 = 20000 paisa.
    const rows = rawDb
      .prepare(
        `SELECT unit_code, expense_paisa FROM v_unit_direct_expense
         WHERE tenant_id = ? AND expense_date = ? ORDER BY unit_code`,
      )
      .all(TENANT_ID, EXPENSE_DATE);

    expect(rows).toEqual([
      { unit_code: 'PARTS', expense_paisa: 20000 },
      { unit_code: 'REPAIR', expense_paisa: 80000 },
    ]);
  });

  it('v_overhead_pool: Electricity (SHARED) appears with allocation_method=shared_revenue, overhead_paisa=450000; PARTS/REPAIR do not appear', () => {
    const rows = rawDb
      .prepare(
        `SELECT allocation_method, parts_share_bp, overhead_paisa FROM v_overhead_pool
         WHERE tenant_id = ? AND expense_date = ?`,
      )
      .all(TENANT_ID, EXPENSE_DATE);

    expect(rows).toEqual([
      { allocation_method: 'shared_revenue', parts_share_bp: null, overhead_paisa: 450000 },
    ]);
  });
});
