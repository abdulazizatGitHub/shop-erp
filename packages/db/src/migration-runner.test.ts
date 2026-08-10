import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
    ]);
  });

  it('refuses to run if an applied migration checksum no longer matches', () => {
    migrate(dbPath, migrationsDir, backupDir);
    const db = new Database(dbPath);
    db.prepare(`UPDATE schema_migration SET checksum = 'tampered' WHERE version = 1`).run();
    db.close();

    expect(() => migrate(dbPath, migrationsDir, backupDir)).toThrow(/has changed on disk/);
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
