import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportOpeningStockInput } from '@shop/contracts';
import { openDatabase, migrate, seed } from '@shop/db';
import { runImport, type ImportHandlerDeps } from './import.handler.js';
import {
  runOpeningStockImport,
  type OpeningStockImportHandlerDeps,
} from './opening-stock-import.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const itemsFixturePath = path.join(
  import.meta.dirname,
  '../../../../../packages/core/src/import/__fixtures__/items.csv',
);
const openingStockFixturePath = path.join(
  import.meta.dirname,
  '../../../../../packages/core/src/import/__fixtures__/opening_stock.csv',
);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let deps: ImportHandlerDeps & OpeningStockImportHandlerDeps;

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-opening-stock-handler-test-'));
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

  // Opening stock matches against items already committed to the DB —
  // seed real items via the Items handler first, same as the fixture set
  // packages/db's import.repository.test.ts uses for the same reason.
  const itemsCsv = readFileSync(itemsFixturePath, 'utf8');
  await runImport(deps, itemsCsv, true);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('runOpeningStockImport (Option B — receives CSV content directly, no file path)', () => {
  it('valid openingStockCsv, commit=true: parses, validates, and inserts real stock_movement rows', async () => {
    const openingStockCsv = readFileSync(openingStockFixturePath, 'utf8');

    const result = await runOpeningStockImport(deps, openingStockCsv, true);

    expect(result.accepted).toBeGreaterThan(0);
    expect(result.reportPath).toBeTruthy();

    const db = openDatabase(dbPath);
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM stock_movement WHERE tenant_id = ? AND movement_type = 'opening'",
      )
      .get(TENANT_ID) as { count: number };
    db.close();
    expect(row.count).toBe(result.accepted);
  });

  it('valid openingStockCsv, commit=false (dry run): validates but inserts nothing', async () => {
    const openingStockCsv = readFileSync(openingStockFixturePath, 'utf8');

    const result = await runOpeningStockImport(deps, openingStockCsv, false);
    expect(result.accepted).toBeGreaterThan(0);

    const db = openDatabase(dbPath);
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM stock_movement WHERE tenant_id = ? AND movement_type = 'opening'",
      )
      .get(TENANT_ID) as { count: number };
    db.close();
    expect(row.count).toBe(0);
  });

  it('the report is written only to logDir, not next to a source file — there is no source path under Option B', async () => {
    const openingStockCsv = readFileSync(openingStockFixturePath, 'utf8');

    const result = await runOpeningStockImport(deps, openingStockCsv, true);

    expect(result.reportPath).toBe(result.logReportPath);
    expect(result.reportPath.startsWith(deps.logDir)).toBe(true);
  });

  it('a CSV with no recognizable header row (core-level failure) rejects, does not silently succeed', async () => {
    const garbageCsv = 'not,a,real,header\n1,2,3,4';

    await expect(runOpeningStockImport(deps, garbageCsv, true)).rejects.toThrow(
      /Could not find a header row/,
    );
  });
});

describe('ImportOpeningStockInput (Zod schema)', () => {
  it('accepts a payload with openingStockCsv', () => {
    expect(() => ImportOpeningStockInput.parse({ openingStockCsv: 'a,b,c' })).not.toThrow();
  });

  it('rejects a payload missing openingStockCsv', () => {
    expect(() => ImportOpeningStockInput.parse({})).toThrow();
  });

  it('rejects an empty openingStockCsv string', () => {
    expect(() => ImportOpeningStockInput.parse({ openingStockCsv: '' })).toThrow();
  });
});
