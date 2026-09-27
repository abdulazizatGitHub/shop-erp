import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CashMovementAlreadyReversedError,
  CashMovementSessionClosedError,
  CashSessionNotOpenError,
  ReversalOfReversalError,
} from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as KyselyDatabase } from '../kysely-schema.js';
import { KyselyCashSessionRepository } from './cash-session.repository.js';
import { KyselyCashMovementRepository } from './cash-movement.repository.js';
import { getExpenseSummaryReport } from './report.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kyselyDb: Kysely<KyselyDatabase>;
let sessionRepo: KyselyCashSessionRepository;
let movementRepo: KyselyCashMovementRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-cash-movement-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  kyselyDb = createKyselyDb(rawDb);
  sessionRepo = new KyselyCashSessionRepository(kyselyDb, TENANT_ID, DEVICE_CODE);
  movementRepo = new KyselyCashMovementRepository(kyselyDb, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

function movementRow(id: string): Record<string, unknown> {
  return rawDb.prepare(`SELECT * FROM cash_movement WHERE id = ?`).get(id) as Record<
    string,
    unknown
  >;
}

function countRows(table: string): number {
  return (rawDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

// Phase 17.5 (docs/phases/PHASE_17_5.md SS4/SS5 T3), ADR-0016.
describe('KyselyCashMovementRepository.recordMovement', () => {
  it('throws CashSessionNotOpenError, zero rows inserted, when no session is open', async () => {
    await expect(
      movementRepo.recordMovement({
        movementType: 'bank_deposit',
        amountPaisa: -100000,
        note: 'Bank deposit',
      }),
    ).rejects.toBeInstanceOf(CashSessionNotOpenError);

    expect(countRows('cash_movement')).toBe(0);
  });

  it("throws CashSessionNotOpenError when the day's session is already closed", async () => {
    const opened = await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    await sessionRepo.closeSession({ sessionId: opened.id, countedCashPaisa: 500000 });

    await expect(
      movementRepo.recordMovement({
        movementType: 'float_add',
        amountPaisa: 100000,
        note: 'Change added',
      }),
    ).rejects.toBeInstanceOf(CashSessionNotOpenError);

    expect(countRows('cash_movement')).toBe(0);
  });

  it('inserts exactly one cash_movement row, one audit_log row, and one sync_outbox row, in one transaction', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });

    const record = await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });

    expect(countRows('cash_movement')).toBe(1);
    const audit = rawDb
      .prepare(`SELECT * FROM audit_log WHERE table_name = 'cash_movement' AND record_id = ?`)
      .all(record.id);
    expect(audit).toHaveLength(1);
    const outbox = rawDb
      .prepare(`SELECT * FROM sync_outbox WHERE table_name = 'cash_movement' AND record_id = ?`)
      .all(record.id);
    expect(outbox).toHaveLength(1);
  });

  it('validates via assertCashMovementValid — rejects a positive bank_deposit, zero amount, and a blank note', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });

    await expect(
      movementRepo.recordMovement({ movementType: 'bank_deposit', amountPaisa: 100000, note: 'x' }),
    ).rejects.toThrow('"bank_deposit" must be a negative amount');
    await expect(
      movementRepo.recordMovement({ movementType: 'other', amountPaisa: 0, note: 'x' }),
    ).rejects.toThrow('Cash movement amount cannot be zero.');
    await expect(
      movementRepo.recordMovement({ movementType: 'other', amountPaisa: 1000, note: '  ' }),
    ).rejects.toThrow('A note is required for every cash movement.');
    expect(countRows('cash_movement')).toBe(0);
  });

  // Review round 3 R6.
  it("movementDate always follows the open session's own sessionDate, never the wall clock", async () => {
    await sessionRepo.openSession({ date: '2020-01-01', openingCashPaisa: 500000 });

    const record = await movementRepo.recordMovement({
      movementType: 'float_add',
      amountPaisa: 50000,
      note: 'Change top-up',
    });

    expect(record.movementDate).toBe('2020-01-01');
    expect(movementRow(record.id)['movement_date']).toBe('2020-01-01');
  });

  it('assigns a CM-prefixed doc_no', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });

    const record = await movementRepo.recordMovement({
      movementType: 'float_add',
      amountPaisa: 50000,
      note: 'Change top-up',
    });

    expect(record.docNo).toMatch(/^CM-\d{4}$/);
  });

  // Confirms cash_movement has zero effect on either unit's P&L, proven
  // directly rather than argued (ADR-0016's own claim).
  it("recording a movement leaves getExpenseSummaryReport's totals byte-identical", async () => {
    const businessUnit = rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string };
    const category = rawDb
      .prepare(`SELECT id FROM expense_category WHERE tenant_id = ? LIMIT 1`)
      .get(TENANT_ID) as { id: string };
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO expense (id, tenant_id, doc_no, category_id, business_unit_id, expense_date, amount, method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'cash', ?)`,
      )
      .run(
        'expense-1',
        TENANT_ID,
        'EXP-TEST-1',
        category.id,
        businessUnit.id,
        '2026-08-15',
        80000,
        now,
      );

    const before = await getExpenseSummaryReport(kyselyDb, TENANT_ID, '2026-08-01', '2026-08-31');

    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });

    const after = await getExpenseSummaryReport(kyselyDb, TENANT_ID, '2026-08-01', '2026-08-31');

    expect(after).toEqual(before);

    const directExpense = rawDb
      .prepare(`SELECT SUM(expense_paisa) AS total FROM v_unit_direct_expense WHERE tenant_id = ?`)
      .get(TENANT_ID) as { total: number };
    expect(directExpense.total).toBe(80000); // unchanged by the cash_movement row
  });
});

describe('KyselyCashMovementRepository.reverseMovement', () => {
  it('inserts exactly one new row with reversesId set to the original and amount negated; the original is byte-unchanged', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    const original = await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });
    const originalRowBefore = movementRow(original.id);

    const reversal = await movementRepo.reverseMovement({
      originalId: original.id,
      note: 'Correcting a data-entry mistake',
    });

    expect(reversal.reversesId).toBe(original.id);
    expect(reversal.amountPaisa).toBe(120000);
    expect(countRows('cash_movement')).toBe(2);
    expect(movementRow(original.id)).toEqual(originalRowBefore);
  });

  it('reversing the same original a second time throws CashMovementAlreadyReversedError, zero extra rows', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    const original = await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });
    await movementRepo.reverseMovement({ originalId: original.id, note: 'First correction' });

    await expect(
      movementRepo.reverseMovement({ originalId: original.id, note: 'Second attempt' }),
    ).rejects.toBeInstanceOf(CashMovementAlreadyReversedError);
    expect(countRows('cash_movement')).toBe(2);
  });

  it('reversing a bank_deposit (originally negative) succeeds with a positive reversal amount — the sign-per-type rule is scoped to original rows only', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    const original = await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });

    const reversal = await movementRepo.reverseMovement({
      originalId: original.id,
      note: 'Correction',
    });

    expect(reversal.amountPaisa).toBe(120000);
    expect(reversal.movementType).toBe('bank_deposit');
  });

  it('a reversal row cannot itself be reversed — ReversalOfReversalError', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    const original = await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });
    const reversal = await movementRepo.reverseMovement({
      originalId: original.id,
      note: 'Correction',
    });

    await expect(
      movementRepo.reverseMovement({ originalId: reversal.id, note: 'Undo the undo' }),
    ).rejects.toBeInstanceOf(ReversalOfReversalError);
    expect(countRows('cash_movement')).toBe(2);
  });

  // Review round 3/4, R7/R8: reversal is refused once the original's own
  // day is no longer the currently-open session.
  it('refuses to reverse a movement whose own session has since closed, with the exact plain message', async () => {
    const opened = await sessionRepo.openSession({
      date: '2026-08-15',
      openingCashPaisa: 500000,
    });
    const original = await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });
    await sessionRepo.closeSession({ sessionId: opened.id, countedCashPaisa: 380000 });

    let caught: unknown;
    try {
      await movementRepo.reverseMovement({ originalId: original.id, note: 'Too late' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CashMovementSessionClosedError);
    expect((caught as Error).message).toBe(
      'That day is closed — its cash difference already reflects this. Add a note to the closed session instead.',
    );
    expect(countRows('cash_movement')).toBe(1); // no reversal row inserted
  });

  it("refuses to reverse a movement when a DIFFERENT date's session is now open", async () => {
    const opened = await sessionRepo.openSession({
      date: '2026-08-15',
      openingCashPaisa: 500000,
    });
    const original = await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });
    await sessionRepo.closeSession({ sessionId: opened.id, countedCashPaisa: 380000 });
    await sessionRepo.openSession({ date: '2026-08-16', openingCashPaisa: 380000 });

    await expect(
      movementRepo.reverseMovement({ originalId: original.id, note: 'Too late' }),
    ).rejects.toBeInstanceOf(CashMovementSessionClosedError);
  });
});

describe('KyselyCashMovementRepository.listForDateRange', () => {
  it('returns movements within the range, ordered by date then creation time', async () => {
    const first = await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -100000,
      note: 'Day 1 deposit',
    });
    await sessionRepo.closeSession({ sessionId: first.id, countedCashPaisa: 400000 });
    await sessionRepo.openSession({ date: '2026-08-16', openingCashPaisa: 400000 });
    await movementRepo.recordMovement({
      movementType: 'float_add',
      amountPaisa: 20000,
      note: 'Day 2 float top-up',
    });

    const rows = await movementRepo.listForDateRange('2026-08-15', '2026-08-16');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.movementDate).toBe('2026-08-15');
    expect(rows[1]?.movementDate).toBe('2026-08-16');
  });

  it('excludes movements outside the requested range', async () => {
    await sessionRepo.openSession({ date: '2026-08-15', openingCashPaisa: 500000 });
    await movementRepo.recordMovement({
      movementType: 'bank_deposit',
      amountPaisa: -100000,
      note: 'Out of range',
    });

    const rows = await movementRepo.listForDateRange('2026-09-01', '2026-09-30');
    expect(rows).toHaveLength(0);
  });
});
