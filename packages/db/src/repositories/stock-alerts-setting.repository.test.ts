import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import {
  getDefaultLowStockThresholdMilli,
  getNegativeStockPolicy,
  setDefaultLowStockThresholdMilli,
  setNegativeStockPolicy,
} from './stock-alerts-setting.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: ReturnType<typeof createKyselyDb>;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-stock-alerts-setting-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('negative stock policy setting (P17-1, docs/phases/PHASE_17.md §2.1/§8)', () => {
  it("defaults to 'warn' when no setting row has ever been written", async () => {
    const value = await getNegativeStockPolicy(kysely, TENANT_ID);
    expect(value).toBe('warn');

    const row = rawDb
      .prepare(
        `SELECT COUNT(*) AS n FROM setting WHERE tenant_id = ? AND key = 'negativeStockPolicy'`,
      )
      .get(TENANT_ID) as { n: number };
    expect(row.n).toBe(0); // reading the default never writes a row
  });

  it("returns 'block' after being explicitly set", async () => {
    await setNegativeStockPolicy(kysely, TENANT_ID, 'block');

    const value = await getNegativeStockPolicy(kysely, TENANT_ID);
    expect(value).toBe('block');

    const row = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'negativeStockPolicy'`)
      .get(TENANT_ID) as { value: string };
    expect(row.value).toBe('block');
  });

  it('setting it twice updates the same row rather than inserting a duplicate', async () => {
    await setNegativeStockPolicy(kysely, TENANT_ID, 'block');
    await setNegativeStockPolicy(kysely, TENANT_ID, 'warn');

    const rows = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'negativeStockPolicy'`)
      .all(TENANT_ID) as Array<{ value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('warn');
  });
});

describe('default low-stock threshold setting (P17-2, docs/phases/PHASE_17.md §2.2/§8)', () => {
  it('defaults to 0 when no setting row has ever been written', async () => {
    const value = await getDefaultLowStockThresholdMilli(kysely, TENANT_ID);
    expect(value).toBe(0);

    const row = rawDb
      .prepare(
        `SELECT COUNT(*) AS n FROM setting WHERE tenant_id = ? AND key = 'lowStockThresholdMilli'`,
      )
      .get(TENANT_ID) as { n: number };
    expect(row.n).toBe(0); // reading the default never writes a row
  });

  it('returns the explicitly set value (5 pieces = 5000 milli)', async () => {
    await setDefaultLowStockThresholdMilli(kysely, TENANT_ID, 5000);

    const value = await getDefaultLowStockThresholdMilli(kysely, TENANT_ID);
    expect(value).toBe(5000);
  });

  it('setting it twice updates the same row rather than inserting a duplicate', async () => {
    await setDefaultLowStockThresholdMilli(kysely, TENANT_ID, 5000);
    await setDefaultLowStockThresholdMilli(kysely, TENANT_ID, 2000);

    const rows = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'lowStockThresholdMilli'`)
      .all(TENANT_ID) as Array<{ value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('2000');

    const value = await getDefaultLowStockThresholdMilli(kysely, TENANT_ID);
    expect(value).toBe(2000);
  });

  it('a malformed or non-numeric stored value falls back to the default (0), not NaN', async () => {
    rawDb
      .prepare(
        `INSERT INTO setting (tenant_id, key, value, updated_at) VALUES (?, 'lowStockThresholdMilli', 'not-a-number', ?)`,
      )
      .run(TENANT_ID, new Date().toISOString());

    const value = await getDefaultLowStockThresholdMilli(kysely, TENANT_ID);
    expect(value).toBe(0);
  });
});
