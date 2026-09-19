import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { getShopIdentity, setShopIdentity } from './shop-identity.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: ReturnType<typeof createKyselyDb>;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-shop-identity-repo-test-'));
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

describe('getShopIdentity (CL-0a)', () => {
  it('returns shopName default "Shop ERP" when the key is missing from the DB', async () => {
    const identity = await getShopIdentity(kysely, TENANT_ID);
    expect(identity.shopName).toBe('Shop ERP');
  });

  it('returns all seven fields correctly when all keys are present', async () => {
    const now = new Date().toISOString();
    const rows: ReadonlyArray<readonly [string, string]> = [
      ['shopName', 'Malakand AC & Fridge Care'],
      ['shopPhone', '0300-1234567'],
      ['shopAddress', 'Main Bazaar, Malakand'],
      ['shopEmail', 'shop@example.com'],
      ['invoiceHeaderText', 'Thank you for your business'],
      ['invoiceFooterText', 'Goods once sold are not returnable'],
      ['statementFooterText', 'Please clear dues within 30 days'],
    ];
    for (const [key, value] of rows) {
      rawDb
        .prepare(`INSERT INTO setting (tenant_id, key, value, updated_at) VALUES (?, ?, ?, ?)`)
        .run(TENANT_ID, key, value, now);
    }

    const identity = await getShopIdentity(kysely, TENANT_ID);
    expect(identity).toEqual({
      shopName: 'Malakand AC & Fridge Care',
      shopPhone: '0300-1234567',
      shopAddress: 'Main Bazaar, Malakand',
      shopEmail: 'shop@example.com',
      invoiceHeaderText: 'Thank you for your business',
      invoiceFooterText: 'Goods once sold are not returnable',
      statementFooterText: 'Please clear dues within 30 days',
    });
  });

  it('returns null for optional fields when those keys are absent', async () => {
    const identity = await getShopIdentity(kysely, TENANT_ID);
    expect(identity.shopPhone).toBeNull();
    expect(identity.shopAddress).toBeNull();
    expect(identity.shopEmail).toBeNull();
    expect(identity.invoiceHeaderText).toBeNull();
    expect(identity.invoiceFooterText).toBeNull();
    expect(identity.statementFooterText).toBeNull();
  });
});

describe('setShopIdentity (CL-0a settings page save)', () => {
  it('round-trips all seven fields through a write then a read', async () => {
    await setShopIdentity(kysely, TENANT_ID, {
      shopName: 'Malakand AC & Fridge Care',
      shopPhone: '0300-1234567',
      shopAddress: 'Main Bazaar, Malakand',
      shopEmail: 'shop@example.com',
      invoiceHeaderText: 'Thank you for your business',
      invoiceFooterText: 'Goods once sold are not returnable',
      statementFooterText: 'Please clear dues within 30 days',
    });

    const identity = await getShopIdentity(kysely, TENANT_ID);
    expect(identity).toEqual({
      shopName: 'Malakand AC & Fridge Care',
      shopPhone: '0300-1234567',
      shopAddress: 'Main Bazaar, Malakand',
      shopEmail: 'shop@example.com',
      invoiceHeaderText: 'Thank you for your business',
      invoiceFooterText: 'Goods once sold are not returnable',
      statementFooterText: 'Please clear dues within 30 days',
    });
  });

  it('writing null for an optional field clears it back to null on read', async () => {
    await setShopIdentity(kysely, TENANT_ID, {
      shopName: 'Shop With Phone',
      shopPhone: '0300-1234567',
      shopAddress: null,
      shopEmail: null,
      invoiceHeaderText: null,
      invoiceFooterText: null,
      statementFooterText: null,
    });
    await setShopIdentity(kysely, TENANT_ID, {
      shopName: 'Shop With Phone',
      shopPhone: null,
      shopAddress: null,
      shopEmail: null,
      invoiceHeaderText: null,
      invoiceFooterText: null,
      statementFooterText: null,
    });

    const identity = await getShopIdentity(kysely, TENANT_ID);
    expect(identity.shopPhone).toBeNull();
  });
});
