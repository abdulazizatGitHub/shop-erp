import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportItemsInput } from '@shop/contracts';
import { openDatabase, migrate, seed } from '@shop/db';
import { runImport, type ImportHandlerDeps } from './import.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const itemsFixturePath = path.join(
  import.meta.dirname,
  '../../../../../packages/core/src/import/__fixtures__/items.csv',
);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let deps: ImportHandlerDeps;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-import-handler-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  rawDb.close();
  deps = {
    dbPath,
    tenantId: TENANT_ID,
    deviceCode: DEVICE_CODE,
    logDir: path.join(workDir, 'logs'),
  };
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('runImport (Option B — receives CSV content directly, no file path)', () => {
  it('valid itemsCsv, commit=true: parses, validates, and inserts real rows into the DB', async () => {
    const itemsCsv = readFileSync(itemsFixturePath, 'utf8');

    const result = await runImport(deps, itemsCsv, true);

    expect(result.itemsAccepted).toBeGreaterThan(0);
    expect(result.itemsReportPath).toBeTruthy();

    const db = openDatabase(dbPath);
    const row = db
      .prepare('SELECT COUNT(*) as count FROM item WHERE tenant_id = ?')
      .get(TENANT_ID) as { count: number };
    db.close();
    expect(row.count).toBe(result.itemsAccepted);
  });

  it('valid itemsCsv, commit=false (dry run): validates but inserts nothing', async () => {
    const itemsCsv = readFileSync(itemsFixturePath, 'utf8');

    const result = await runImport(deps, itemsCsv, false);
    expect(result.itemsAccepted).toBeGreaterThan(0);

    const db = openDatabase(dbPath);
    const row = db
      .prepare('SELECT COUNT(*) as count FROM item WHERE tenant_id = ?')
      .get(TENANT_ID) as { count: number };
    db.close();
    expect(row.count).toBe(0);
  });

  it('the report is written only to logDir, not next to a source file — there is no source path under Option B', async () => {
    const itemsCsv = readFileSync(itemsFixturePath, 'utf8');

    const result = await runImport(deps, itemsCsv, true);

    expect(result.itemsReportPath).toBe(result.itemsLogReportPath);
    expect(result.itemsReportPath.startsWith(deps.logDir)).toBe(true);
  });

  it('a CSV with no recognizable header row (core-level failure) rejects, does not silently succeed', async () => {
    const garbageCsv = 'not,a,real,header\n1,2,3,4';

    await expect(runImport(deps, garbageCsv, true)).rejects.toThrow(/Could not find a header row/);
  });
});

describe('ImportItemsInput (Zod schema)', () => {
  it('accepts a payload with only itemsCsv', () => {
    expect(() => ImportItemsInput.parse({ itemsCsv: 'a,b,c' })).not.toThrow();
  });

  it('rejects a payload missing itemsCsv', () => {
    expect(() => ImportItemsInput.parse({})).toThrow();
  });

  it('rejects an empty itemsCsv string', () => {
    expect(() => ImportItemsInput.parse({ itemsCsv: '' })).toThrow();
  });
});
