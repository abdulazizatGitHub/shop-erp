import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import { KyselyExpenseRepository } from './expense.repository.js';
import { KyselyExpenseCategoryRepository } from './expense-category.repository.js';
import { getExpenseSummaryReport } from './report.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let repo: KyselyExpenseCategoryRepository;
let expenseRepo: KyselyExpenseRepository;
let sharedBusinessUnitId: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-expense-category-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  repo = new KyselyExpenseCategoryRepository(kysely, TENANT_ID);
  expenseRepo = new KyselyExpenseRepository(kysely, TENANT_ID, DEVICE_CODE);

  sharedBusinessUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'SHARED'`)
      .get(TENANT_ID) as { id: string }
  ).id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

function rawCategoryRow(id: string): {
  kind: string;
  isBillable: number;
  isOwnerDrawing: number;
  allocationMethod: string;
  partsShareBp: number | null;
} {
  return rawDb
    .prepare(
      `SELECT kind, is_billable AS isBillable, is_owner_drawing AS isOwnerDrawing, allocation_method AS allocationMethod, parts_share_bp AS partsShareBp FROM expense_category WHERE id = ?`,
    )
    .get(id) as {
    kind: string;
    isBillable: number;
    isOwnerDrawing: number;
    allocationMethod: string;
    partsShareBp: number | null;
  };
}

/**
 * P17-4 (docs/phases/PHASE_17.md §2.6/§8, S17-EXP-1, Q-DRAWING/A17-3/Q17-5).
 */
describe('createExpenseCategory (name-only form)', () => {
  it('creates a category with the name-only form defaults: kind=variable, isBillable=false, isOwnerDrawing=false, allocationMethod=direct, partsShareBp=null', async () => {
    const record = await repo.createExpenseCategory({ name: 'Office Supplies' });

    expect(record.name).toBe('Office Supplies');
    expect(record.isActive).toBe(true);

    const row = rawCategoryRow(record.id);
    expect(row.kind).toBe('variable');
    expect(row.isBillable).toBe(0);
    expect(row.isOwnerDrawing).toBe(0);
    expect(row.allocationMethod).toBe('direct');
    expect(row.partsShareBp).toBeNull();
  });

  it('rejects a case-insensitive duplicate name for this tenant', async () => {
    await repo.createExpenseCategory({ name: 'Office Supplies' });
    await expect(repo.createExpenseCategory({ name: 'office supplies' })).rejects.toThrow(
      /already exists/,
    );
  });
});

describe('updateExpenseCategoryName (edit, name only, allowed even once referenced)', () => {
  it('renames a category that has no expenses yet', async () => {
    const created = await repo.createExpenseCategory({ name: 'Office Supplies' });

    const updated = await repo.updateExpenseCategoryName({
      id: created.id,
      name: 'Stationery',
    });

    expect(updated.name).toBe('Stationery');
  });

  it('renaming succeeds even once an expense references the category — the edit input itself has no other field to lock', async () => {
    const created = await repo.createExpenseCategory({ name: 'Office Supplies' });
    await expenseRepo.createExpense({
      categoryId: created.id,
      expenseDate: '2026-08-05',
      amountPaisa: 50000,
      businessUnitId: sharedBusinessUnitId,
      vehicle: null,
      method: 'cash',
      notes: null,
    });

    const updated = await repo.updateExpenseCategoryName({
      id: created.id,
      name: 'Stationery',
    });

    expect(updated.name).toBe('Stationery');
    // kind/isBillable/isOwnerDrawing/allocationMethod/partsShareBp are
    // untouched by this call — there is nothing in UpdateExpenseCategoryRepoInput
    // to change them with.
    const row = rawCategoryRow(created.id);
    expect(row.kind).toBe('variable');
    expect(row.isBillable).toBe(0);
    expect(row.isOwnerDrawing).toBe(0);
  });

  it('rejects renaming to a name already used by another category', async () => {
    await repo.createExpenseCategory({ name: 'Office Supplies' });
    const second = await repo.createExpenseCategory({ name: 'Stationery' });

    await expect(
      repo.updateExpenseCategoryName({ id: second.id, name: 'Office Supplies' }),
    ).rejects.toThrow(/already exists/);
  });

  it('renaming a category to its own unchanged name does not trip the duplicate check', async () => {
    const created = await repo.createExpenseCategory({ name: 'Office Supplies' });

    await expect(
      repo.updateExpenseCategoryName({ id: created.id, name: 'Office Supplies' }),
    ).resolves.toMatchObject({ name: 'Office Supplies' });
  });
});

describe('toggleExpenseCategoryActive (deactivate/reactivate, soft via deleted_at)', () => {
  it('deactivating sets deleted_at and isActive=false; reactivating clears it', async () => {
    const created = await repo.createExpenseCategory({ name: 'Office Supplies' });

    const deactivated = await repo.toggleExpenseCategoryActive(created.id, false);
    expect(deactivated.isActive).toBe(false);
    const deletedRow = rawDb
      .prepare(`SELECT deleted_at AS deletedAt FROM expense_category WHERE id = ?`)
      .get(created.id) as { deletedAt: string | null };
    expect(deletedRow.deletedAt).not.toBeNull();

    const reactivated = await repo.toggleExpenseCategoryActive(created.id, true);
    expect(reactivated.isActive).toBe(true);
    const clearedRow = rawDb
      .prepare(`SELECT deleted_at AS deletedAt FROM expense_category WHERE id = ?`)
      .get(created.id) as { deletedAt: string | null };
    expect(clearedRow.deletedAt).toBeNull();
  });

  it('deactivating a category never edits any existing expense row referencing it', async () => {
    const created = await repo.createExpenseCategory({ name: 'Office Supplies' });
    const expense = await expenseRepo.createExpense({
      categoryId: created.id,
      expenseDate: '2026-08-05',
      amountPaisa: 50000,
      businessUnitId: sharedBusinessUnitId,
      vehicle: null,
      method: 'cash',
      notes: null,
    });

    await repo.toggleExpenseCategoryActive(created.id, false);

    const expenseRow = rawDb
      .prepare(`SELECT category_id AS categoryId, amount FROM expense WHERE id = ?`)
      .get(expense.id) as { categoryId: string; amount: number };
    expect(expenseRow.categoryId).toBe(created.id);
    expect(expenseRow.amount).toBe(50000);
  });
});

describe('listExpenseCategoriesAdmin (active AND inactive — unlike listCategories, the create-expense picker)', () => {
  it('includes a deactivated category, with isActive=false, so it can be reactivated', async () => {
    const created = await repo.createExpenseCategory({ name: 'Office Supplies' });
    await repo.toggleExpenseCategoryActive(created.id, false);

    const rows = await repo.listExpenseCategoriesAdmin();
    const row = rows.find((r) => r.id === created.id);
    expect(row).toBeDefined();
    expect(row?.isActive).toBe(false);
  });

  it('includes the 6 bootstrap-seeded categories plus any newly created one', async () => {
    await repo.createExpenseCategory({ name: 'Office Supplies' });

    const rows = await repo.listExpenseCategoriesAdmin();
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.some((r) => r.name === 'Office Supplies')).toBe(true);
    expect(rows.some((r) => r.name === 'Electricity')).toBe(true);
  });
});

/**
 * Priority test (§8): an expense in a category deactivated AFTER the
 * fact still appears in getExpenseSummaryReport's totals — deactivation
 * must never edit or exclude historical expense rows. Hand-calculated:
 * two expenses in the same category/business-unit/date-range,
 * Rs 500 (50,000 paisa) + Rs 300 (30,000 paisa) = Rs 800 (80,000 paisa)
 * total, count 2 — computed BEFORE deactivation, then re-queried AFTER
 * deactivating the category, asserting the exact same totalPaisa/count.
 */
describe('deactivation never affects historical expense reporting (priority test, §8)', () => {
  it('getExpenseSummaryReport totals for a deactivated category are unchanged after deactivation', async () => {
    const category = await repo.createExpenseCategory({ name: 'Bike Fuel Test' });

    await expenseRepo.createExpense({
      categoryId: category.id,
      expenseDate: '2026-08-05',
      amountPaisa: 50000, // Rs 500
      businessUnitId: sharedBusinessUnitId,
      vehicle: 'Bike-1',
      method: 'cash',
      notes: null,
    });
    await expenseRepo.createExpense({
      categoryId: category.id,
      expenseDate: '2026-08-20',
      amountPaisa: 30000, // Rs 300
      businessUnitId: sharedBusinessUnitId,
      vehicle: 'Bike-1',
      method: 'cash',
      notes: null,
    });

    const before = await getExpenseSummaryReport(kysely, TENANT_ID, '2026-08-01', '2026-08-31');
    const beforeRow = before.find((r) => r.categoryName === 'Bike Fuel Test');
    // 50,000 + 30,000 = 80,000 paisa (Rs 800), 2 expenses
    expect(beforeRow?.totalPaisa).toBe(80000);
    expect(beforeRow?.count).toBe(2);

    await repo.toggleExpenseCategoryActive(category.id, false);

    const after = await getExpenseSummaryReport(kysely, TENANT_ID, '2026-08-01', '2026-08-31');
    const afterRow = after.find((r) => r.categoryName === 'Bike Fuel Test');
    expect(afterRow?.totalPaisa).toBe(80000);
    expect(afterRow?.count).toBe(2);
  });

  it("expense:list's own category join also still returns the historical rows after deactivation", async () => {
    const category = await repo.createExpenseCategory({ name: 'Courier Test' });
    await expenseRepo.createExpense({
      categoryId: category.id,
      expenseDate: '2026-08-10',
      amountPaisa: 20000,
      businessUnitId: sharedBusinessUnitId,
      vehicle: null,
      method: 'cash',
      notes: null,
    });

    await repo.toggleExpenseCategoryActive(category.id, false);

    const rows = await expenseRepo.listExpenses({ from: '2026-08-01', to: '2026-08-31' });
    const row = rows.find((r) => r.categoryId === category.id);
    expect(row).toBeDefined();
    expect(row?.categoryName).toBe('Courier Test');
    expect(row?.amountPaisa).toBe(20000);
  });
});
