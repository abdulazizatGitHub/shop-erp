import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionAlreadyOpenError } from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyCashSessionRepository } from './cash-session.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyCashSessionRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-cash-session-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyCashSessionRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

function defaultWarehouseId(): string {
  return (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;
}

function defaultPriceLevelId(): string {
  return (
    rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;
}

function seedCashSale(date: string, totalAmountPaisa: number): void {
  rawDb
    .prepare(
      `INSERT INTO sale
         (id, tenant_id, doc_no, warehouse_id, price_level_id, sale_date, sale_type,
          total_amount, payment_mode, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'counter', ?, 'cash', 'confirmed', ?, ?)`,
    )
    .run(
      'sale-' + date,
      TENANT_ID,
      'INV-TEST-' + date,
      defaultWarehouseId(),
      defaultPriceLevelId(),
      date,
      totalAmountPaisa,
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

function seedCashExpense(date: string, amountPaisa: number): void {
  const categoryId = (
    rawDb.prepare(`SELECT id FROM expense_category WHERE tenant_id = ? LIMIT 1`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  rawDb
    .prepare(
      `INSERT INTO expense (id, tenant_id, doc_no, category_id, expense_date, amount, method, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'cash', ?)`,
    )
    .run(
      'expense-' + date,
      TENANT_ID,
      'EXP-TEST-' + date,
      categoryId,
      date,
      amountPaisa,
      new Date().toISOString(),
    );
}

describe('KyselyCashSessionRepository.openSession (PHASE_7.md §5 GAP-7/GAP-8, EC-P7-5)', () => {
  it('inserts a row and returns CashSessionRecord — opening_cash = 500000 paisa', async () => {
    const record = await repo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });

    expect(record.status).toBe('open');

    const row = rawDb
      .prepare(`SELECT opening_cash, closed_at FROM cash_session WHERE id = ?`)
      .get(record.id) as { opening_cash: number; closed_at: string | null };
    expect(row.opening_cash).toBe(500000);
    expect(row.closed_at).toBeNull();
  });

  it('opening a second session for the same date throws SessionAlreadyOpenError', async () => {
    await repo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });

    await expect(
      repo.openSession({ date: '2026-08-15', openingCashPaisa: 100000 }),
    ).rejects.toBeInstanceOf(SessionAlreadyOpenError);

    const rows = rawDb
      .prepare(`SELECT id FROM cash_session WHERE tenant_id = ? AND session_date = ?`)
      .all(TENANT_ID, '2026-08-15');
    expect(rows).toHaveLength(1);
  });
});

describe('KyselyCashSessionRepository.closeSession (EC-P7-5)', () => {
  it('computes and stores expected_cash and difference correctly', async () => {
    const date = '2026-08-15';
    const opened = await repo.openSession({ date, openingCashPaisa: 500000 });

    seedCashSale(date, 4_000_000); // Rs 40,000 cash sale
    seedCashExpense(date, 80_000); // Rs 800 cash expense

    // Hand-calc (no purchases, no payments in/out for this date):
    //   cash_in  = 500,000 + 4,000,000            = 4,500,000
    //   cash_out = 80,000
    //   expected_cash = 4,500,000 - 80,000         = 4,420,000 paisa
    // counted_cash = 4,500,000 paisa (Rs 45,000)
    //   difference = 4,500,000 - 4,420,000         = 80,000 paisa (Rs 800 over)
    const result = await repo.closeSession({
      sessionId: opened.id,
      countedCashPaisa: 4_500_000,
    });

    expect(result.expectedCashPaisa).toBe(4_420_000);
    expect(result.countedCashPaisa).toBe(4_500_000);
    expect(result.differencePaisa).toBe(80_000);
    expect(result.status).toBe('closed');

    const row = rawDb
      .prepare(
        `SELECT expected_cash, counted_cash, difference, closed_at FROM cash_session WHERE id = ?`,
      )
      .get(opened.id) as {
      expected_cash: number;
      counted_cash: number;
      difference: number;
      closed_at: string | null;
    };
    expect(row.expected_cash).toBe(4_420_000);
    expect(row.counted_cash).toBe(4_500_000);
    expect(row.difference).toBe(80_000);
    expect(row.closed_at).not.toBeNull();
  });
});

describe('KyselyCashSessionRepository.getSessionByDate', () => {
  it('returns null when no session exists for the date', async () => {
    const result = await repo.getSessionByDate('2026-08-15');
    expect(result).toBeNull();
  });

  it('returns the open session when one exists', async () => {
    const opened = await repo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });

    const result = await repo.getSessionByDate('2026-08-15');

    expect(result).not.toBeNull();
    expect(result?.id).toBe(opened.id);
    expect(result?.status).toBe('open');
    expect(result?.openingCashPaisa).toBe(500000);
  });
});
