import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { migrate } from './migration-runner.js';

const migrationsDir = path.join(import.meta.dirname, 'migrations');

let workDir: string;
let dbPath: string;
let backupDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-migrate-test-'));
  dbPath = path.join(workDir, 'test.db');
  backupDir = path.join(workDir, 'backups');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('applies all migrations to a fresh database with no backup', () => {
    const result = migrate(dbPath, migrationsDir, backupDir);

    expect(result.backupPath).toBeNull();
    expect(result.applied).toEqual([
      '0001_init.sql',
      '0002_business_units.sql',
      '0003_shared_overhead.sql',
      '0004_party_ledger_bill_metadata.sql',
      '0005_party_payment_terms.sql',
    ]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('applies exactly 42 tables and 11 views — the P0-8 baseline', () => {
    migrate(dbPath, migrationsDir, backupDir);
    const db = new Database(dbPath);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all();
    const views = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'view'`).all();
    db.close();

    expect(tables).toHaveLength(42);
    expect(views).toHaveLength(11);
  });

  it('every view executes without error on an empty database', () => {
    migrate(dbPath, migrationsDir, backupDir);
    const db = new Database(dbPath);
    const views = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'view'`).all() as Array<{
      name: string;
    }>;

    for (const view of views) {
      expect(() => db.prepare(`SELECT * FROM ${view.name}`).all()).not.toThrow();
    }
    db.close();
  });

  it('re-running applies nothing the second time, and backs up first', () => {
    migrate(dbPath, migrationsDir, backupDir);
    const second = migrate(dbPath, migrationsDir, backupDir);

    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual([
      '0001_init.sql',
      '0002_business_units.sql',
      '0003_shared_overhead.sql',
      '0004_party_ledger_bill_metadata.sql',
      '0005_party_payment_terms.sql',
    ]);
    expect(second.backupPath).not.toBeNull();
    expect(existsSync(second.backupPath as string)).toBe(true);
    expect(readdirSync(backupDir)).toHaveLength(1);
  });

  it('records applied versions in schema_migration', () => {
    migrate(dbPath, migrationsDir, backupDir);
    const db = new Database(dbPath);
    const rows = db.prepare(`SELECT version, name FROM schema_migration ORDER BY version`).all();
    db.close();

    expect(rows).toEqual([
      { version: 1, name: '0001_init.sql' },
      { version: 2, name: '0002_business_units.sql' },
      { version: 3, name: '0003_shared_overhead.sql' },
      { version: 4, name: '0004_party_ledger_bill_metadata.sql' },
      { version: 5, name: '0005_party_payment_terms.sql' },
    ]);
  });

  it('refuses to run if an applied migration checksum no longer matches', () => {
    migrate(dbPath, migrationsDir, backupDir);
    const db = new Database(dbPath);
    db.prepare(`UPDATE schema_migration SET checksum = 'tampered' WHERE version = 1`).run();
    db.close();

    expect(() => migrate(dbPath, migrationsDir, backupDir)).toThrow(/has changed on disk/);
  });

  it('applies 0004 to a fresh database — bill_reference/due_date/bill_notes exist and are nullable', () => {
    migrate(dbPath, migrationsDir, backupDir);
    const db = new Database(dbPath);
    const columns = db.prepare(`PRAGMA table_info(party_ledger)`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    db.close();

    for (const columnName of ['bill_reference', 'due_date', 'bill_notes']) {
      const column = columns.find((c) => c.name === columnName);
      expect(column).toBeDefined();
      expect(column?.notnull).toBe(0);
    }
  });

  it('applies 0004 to a database already at 0003 — new columns added, existing row unaffected', () => {
    // Simulate "already migrated to 0003": a migrations dir containing only
    // 0001-0003, per P2-1b's exact verification requirement.
    const partialMigrationsDir = path.join(workDir, 'migrations-through-0003');
    mkdirSync(partialMigrationsDir, { recursive: true });
    for (const file of ['0001_init.sql', '0002_business_units.sql', '0003_shared_overhead.sql']) {
      copyFileSync(path.join(migrationsDir, file), path.join(partialMigrationsDir, file));
    }
    migrate(dbPath, partialMigrationsDir, backupDir);

    // Insert a real party_ledger row using only pre-0004 columns, so we can
    // prove it survives 0004 unaffected.
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const partyId = '00000000-0000-0000-0000-000000000002';
    const ledgerId = '00000000-0000-0000-0000-000000000003';
    let db = new Database(dbPath);
    const seedNow = new Date().toISOString();
    db.prepare(
      `INSERT INTO tenant (id, business_name, created_at, updated_at) VALUES (?, 'Test Tenant', ?, ?)`,
    ).run(tenantId, seedNow, seedNow);
    db.prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, is_active, created_at, updated_at)
       VALUES (?, ?, 'SUP-A-000001', 'supplier', 'Pre-0004 Supplier', 1, ?, ?)`,
    ).run(partyId, tenantId, new Date().toISOString(), new Date().toISOString());
    db.prepare(
      `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, running_note, created_at)
       VALUES (?, ?, ?, '2026-08-01', 'opening_balance', 500000, 'pre-existing note', ?)`,
    ).run(ledgerId, tenantId, partyId, new Date().toISOString());
    db.close();

    // Now migrate onward with the full directory — applies 0004 and 0005.
    const result = migrate(dbPath, migrationsDir, backupDir);
    expect(result.applied).toEqual([
      '0004_party_ledger_bill_metadata.sql',
      '0005_party_payment_terms.sql',
    ]);

    db = new Database(dbPath);
    const columns = db.prepare(`PRAGMA table_info(party_ledger)`).all() as Array<{ name: string }>;
    expect(columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['bill_reference', 'due_date', 'bill_notes']),
    );

    const row = db.prepare(`SELECT * FROM party_ledger WHERE id = ?`).get(ledgerId) as Record<
      string,
      unknown
    >;
    db.close();

    // Pre-existing columns unchanged.
    expect(row['amount']).toBe(500000);
    expect(row['running_note']).toBe('pre-existing note');
    expect(row['entry_type']).toBe('opening_balance');
    // New columns NULL on a row that predates the migration.
    expect(row['bill_reference']).toBeNull();
    expect(row['due_date']).toBeNull();
    expect(row['bill_notes']).toBeNull();
  });

  it('openDatabase sets all four required pragmas on every connection it opens', () => {
    // foreign_keys, synchronous and busy_timeout are per-connection, not
    // file-persisted — the only way to prove they are "actually set" is to
    // open a real connection through the real function and read them back.
    const db = openDatabase(dbPath);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('synchronous', { simple: true })).toBe(2); // FULL
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.close();
  });
});
