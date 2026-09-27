import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, migrate, seed, createKyselyDb, KyselyCashSessionRepository } from '@shop/db';
import { runSetCashSessionNote, type CashSessionHandlerDeps } from './cash-session.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let deps: CashSessionHandlerDeps;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-cash-session-handler-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  const rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  rawDb.close();
  deps = { dbPath, tenantId: TENANT_ID, deviceCode: DEVICE_CODE };
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

async function openAndCloseSession(date: string): Promise<string> {
  const db = openDatabase(dbPath);
  const repo = new KyselyCashSessionRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
  const session = await repo.openSession({ date, openingCashPaisa: 500000 });
  await repo.closeSession({ sessionId: session.id, countedCashPaisa: 500000 });
  db.close();
  return session.id;
}

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), review round 7 follow-up.
 * `runSetCashSessionNote` is the plain function `registerCashSessionHandlers`
 * delegates the new cashSession:setNote channel to — tested directly, no
 * Electron mocking, same precedent as cash-movement.handler.test.ts.
 */
describe('runSetCashSessionNote', () => {
  it('writes a note onto a closed session', async () => {
    const sessionId = await openAndCloseSession('2026-08-15');

    const dto = await runSetCashSessionNote(deps, {
      sessionId,
      note: 'Owner took Rs 2,000 to the bank, forgot to log it as a movement.',
    });

    expect(dto.notes).toBe('Owner took Rs 2,000 to the bank, forgot to log it as a movement.');
  });

  it('is idempotent: a second call replaces the note rather than erroring or appending', async () => {
    const sessionId = await openAndCloseSession('2026-08-15');

    await runSetCashSessionNote(deps, { sessionId, note: 'First note' });
    const dto = await runSetCashSessionNote(deps, { sessionId, note: 'Second, corrected note' });

    expect(dto.notes).toBe('Second, corrected note');
  });
});
