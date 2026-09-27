import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CashMovementSessionClosedError, CashSessionNotOpenError } from '@shop/core';
import { openDatabase, migrate, seed, createKyselyDb, KyselyCashSessionRepository } from '@shop/db';
import {
  runListCashMovements,
  runRecordCashMovement,
  runReverseCashMovement,
  type CashMovementHandlerDeps,
} from './cash-movement.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let deps: CashMovementHandlerDeps;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-cash-movement-handler-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  deps = { dbPath, tenantId: TENANT_ID, deviceCode: DEVICE_CODE };
  rawDb.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

async function openSession(date: string, openingCashPaisa: number): Promise<string> {
  const db = openDatabase(dbPath);
  const repo = new KyselyCashSessionRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
  const session = await repo.openSession({ date, openingCashPaisa });
  db.close();
  return session.id;
}

async function closeSession(sessionId: string, countedCashPaisa: number): Promise<void> {
  const db = openDatabase(dbPath);
  const repo = new KyselyCashSessionRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
  await repo.closeSession({ sessionId, countedCashPaisa });
  db.close();
}

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), Task 5. `runRecordCashMovement`/
 * `runReverseCashMovement`/`runListCashMovements` are the plain functions
 * `registerCashMovementHandlers` delegates to — tested directly, no
 * Electron mocking, same precedent as `item.handler.test.ts`/
 * `sale.handler.test.ts`.
 */
describe('runRecordCashMovement', () => {
  it('throws CashSessionNotOpenError, zero rows inserted, when no session is open', async () => {
    await expect(
      runRecordCashMovement(deps, {
        movementType: 'bank_deposit',
        amountPaisa: -100000,
        note: 'Bank deposit',
      }),
    ).rejects.toBeInstanceOf(CashSessionNotOpenError);

    const db = openDatabase(dbPath);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM cash_movement`).get() as { n: number };
    db.close();
    expect(count.n).toBe(0);
  });

  it('records a movement while a session is open and returns the DTO shape', async () => {
    await openSession('2026-08-15', 500000);

    const dto = await runRecordCashMovement(deps, {
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });

    expect(dto.movementType).toBe('bank_deposit');
    expect(dto.amountPaisa).toBe(-120000);
    expect(dto.note).toBe('Deposited at HBL');
    expect(dto.reversesId).toBeNull();
    expect(dto.docNo).toMatch(/^CM-\d{4}$/);
    expect(dto.movementDate).toBe('2026-08-15');
  });
});

describe('runReverseCashMovement', () => {
  it('reverses a movement while its own session is still open', async () => {
    await openSession('2026-08-15', 500000);
    const original = await runRecordCashMovement(deps, {
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });

    const reversal = await runReverseCashMovement(deps, {
      originalId: original.id,
      note: 'Correcting a data-entry mistake',
    });

    expect(reversal.reversesId).toBe(original.id);
    expect(reversal.amountPaisa).toBe(120000);
  });

  it("refuses to reverse a movement whose own day's session has since closed, with the exact plain message", async () => {
    const sessionId = await openSession('2026-08-15', 500000);
    const original = await runRecordCashMovement(deps, {
      movementType: 'bank_deposit',
      amountPaisa: -120000,
      note: 'Deposited at HBL',
    });
    await closeSession(sessionId, 380000);

    let caught: unknown;
    try {
      await runReverseCashMovement(deps, { originalId: original.id, note: 'Too late' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CashMovementSessionClosedError);
    expect((caught as Error).message).toBe(
      'That day is closed — its cash difference already reflects this. Add a note to the closed session instead.',
    );
  });
});

describe('runListCashMovements', () => {
  it('returns movements within the requested date range', async () => {
    await openSession('2026-08-15', 500000);
    await runRecordCashMovement(deps, {
      movementType: 'float_add',
      amountPaisa: 50000,
      note: 'Change top-up',
    });

    const rows = await runListCashMovements(deps, {
      dateFrom: '2026-08-15',
      dateTo: '2026-08-15',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.movementType).toBe('float_add');
  });
});
