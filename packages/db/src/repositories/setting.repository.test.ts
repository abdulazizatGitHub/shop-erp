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
  getReceiptPaperSize,
  getShopName,
  setReceiptPaperSize,
  setShopName,
} from './setting.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: ReturnType<typeof createKyselyDb>;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-setting-repo-test-'));
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

describe('receipt paper size setting (P4-1a)', () => {
  it('defaults to A4 when no setting row has ever been written', async () => {
    const value = await getReceiptPaperSize(kysely, TENANT_ID);
    expect(value).toBe('A4');

    const row = rawDb
      .prepare(`SELECT COUNT(*) AS n FROM setting WHERE tenant_id = ? AND key = 'receiptPaperSize'`)
      .get(TENANT_ID) as { n: number };
    expect(row.n).toBe(0); // reading the default never writes a row
  });

  it('returns A5 after being explicitly set to A5', async () => {
    await setReceiptPaperSize(kysely, TENANT_ID, 'A5');

    const value = await getReceiptPaperSize(kysely, TENANT_ID);
    expect(value).toBe('A5');

    const row = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'receiptPaperSize'`)
      .get(TENANT_ID) as { value: string };
    expect(row.value).toBe('A5');
  });

  it('setting it twice updates the same row rather than inserting a duplicate', async () => {
    await setReceiptPaperSize(kysely, TENANT_ID, 'A5');
    await setReceiptPaperSize(kysely, TENANT_ID, 'A4');

    const rows = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'receiptPaperSize'`)
      .all(TENANT_ID) as Array<{ value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('A4');

    const value = await getReceiptPaperSize(kysely, TENANT_ID);
    expect(value).toBe('A4');
  });
});

describe('shop name setting (P4-1c)', () => {
  it('defaults to "Shop ERP" when no setting row has ever been written', async () => {
    const value = await getShopName(kysely, TENANT_ID);
    expect(value).toBe('Shop ERP');

    const row = rawDb
      .prepare(`SELECT COUNT(*) AS n FROM setting WHERE tenant_id = ? AND key = 'shopName'`)
      .get(TENANT_ID) as { n: number };
    expect(row.n).toBe(0); // reading the default never writes a row
  });

  it('returns the real shop name after being explicitly set', async () => {
    await setShopName(kysely, TENANT_ID, 'Malakand AC & Fridge Care');

    const value = await getShopName(kysely, TENANT_ID);
    expect(value).toBe('Malakand AC & Fridge Care');

    const row = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'shopName'`)
      .get(TENANT_ID) as { value: string };
    expect(row.value).toBe('Malakand AC & Fridge Care');
  });

  it('setting it twice updates the same row rather than inserting a duplicate', async () => {
    await setShopName(kysely, TENANT_ID, 'First Name');
    await setShopName(kysely, TENANT_ID, 'Second Name');

    const rows = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'shopName'`)
      .all(TENANT_ID) as Array<{ value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('Second Name');
  });
});
