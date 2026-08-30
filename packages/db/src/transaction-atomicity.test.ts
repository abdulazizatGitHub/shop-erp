import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from './connection.js';
import { migrate } from './migration-runner.js';
import { seed } from './bootstrap.js';

const migrationsDir = path.join(import.meta.dirname, 'migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-txn-atomicity-test-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// Verifies transaction atomicity programmatically.
// Does NOT replace the real pull-the-plug test (P4-5b)
// which requires a human to kill the Electron process
// mid-flight and verify WAL recovery on real hardware.
describe('transaction atomicity — better-sqlite3 transaction API, real file, no mocks', () => {
  it('rolls back a party_ledger insert when the transaction throws before commit', () => {
    const dbPath = path.join(workDir, 'atomicity.db');
    migrate(dbPath, migrationsDir, path.join(workDir, 'migrate-backups'));
    const db = openDatabase(dbPath);
    seed(db, TENANT_ID);

    const now = new Date().toISOString();
    const partyId = newId();
    db.prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(partyId, TENANT_ID, 'CUS-TEST', 'customer', 'Atomicity Test Customer', now, now);

    const ledgerId = newId();

    const insertAndThrow = db.transaction(() => {
      db.prepare(
        `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(ledgerId, TENANT_ID, partyId, '2026-08-30', 'sale', 100000, now);

      throw new Error('Simulated crash before commit');
    });

    // better-sqlite3's transaction() wrapper issues BEGIN before running
    // the function and ROLLBACK if it throws, then rethrows — so the
    // insert above must never survive past this point.
    expect(() => insertAndThrow()).toThrow('Simulated crash before commit');

    const row = db.prepare('SELECT id FROM party_ledger WHERE id = ?').get(ledgerId);
    expect(row).toBeUndefined();

    db.close();
  });
});
