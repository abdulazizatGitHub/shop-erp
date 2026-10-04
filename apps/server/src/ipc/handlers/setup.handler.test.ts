import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTenant, migrate, openDatabase } from '@shop/db';
import { finishSetup, getSetupStatus, type SetupHandlerDeps } from './setup.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const itemsFixturePath = path.join(
  import.meta.dirname,
  '../../../../../packages/core/src/import/__fixtures__/items.csv',
);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let deps: SetupHandlerDeps;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-setup-handler-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
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

describe('getSetupStatus', () => {
  it('reports tenantExists=false on a freshly migrated database (no tenant row yet)', () => {
    const status = getSetupStatus(deps);
    expect(status).toEqual({ tenantExists: false });
  });

  it('reports tenantExists=true once a tenant row exists', async () => {
    await finishSetup(deps, { shopName: 'Malakand AC', ownerName: 'Zahid Khan', paperSize: 'A4' });
    const status = getSetupStatus(deps);
    expect(status).toEqual({ tenantExists: true });
  });

  it('interrupted setup: a migrated-but-never-finished database still reports no tenant, as if the app had just been closed mid-wizard', () => {
    // Simulates "app closed mid-wizard" — migrate() has run (every
    // launch does that unconditionally) but finishSetup() never did.
    const before = getSetupStatus(deps);
    expect(before.tenantExists).toBe(false);
    // Re-checking (the "next launch") finds the same thing — nothing
    // about a bare migrate() ever writes a tenant row on its own.
    const nextLaunch = getSetupStatus(deps);
    expect(nextLaunch.tenantExists).toBe(false);
  });
});

describe('finishSetup', () => {
  it('with no CSV: writes the tenant row and settings, returns no import result', async () => {
    const result = await finishSetup(deps, {
      shopName: 'Malakand AC & Fridge Repair',
      ownerName: 'Zahid Khan',
      paperSize: 'A5',
    });

    expect(result).toEqual({ itemsImport: null, itemsImportError: null });

    const db = openDatabase(dbPath);
    expect(hasTenant(db, TENANT_ID)).toBe(true);
    const tenantRow = db
      .prepare(
        `SELECT business_name AS businessName, owner_name AS ownerName FROM tenant WHERE id = ?`,
      )
      .get(TENANT_ID) as { businessName: string; ownerName: string };
    const settingRows = db
      .prepare(
        `SELECT key, value FROM setting WHERE tenant_id = ? AND key IN ('shopName', 'receiptPaperSize')`,
      )
      .all(TENANT_ID) as { key: string; value: string }[];
    db.close();

    expect(tenantRow).toEqual({
      businessName: 'Malakand AC & Fridge Repair',
      ownerName: 'Zahid Khan',
    });
    const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
    expect(settings['shopName']).toBe('Malakand AC & Fridge Repair');
    expect(settings['receiptPaperSize']).toBe('A5');
  });

  it('with a valid CSV: imports items and reports them', async () => {
    const itemsCsv = readFileSync(itemsFixturePath, 'utf8');

    const result = await finishSetup(deps, {
      shopName: 'Malakand AC',
      ownerName: 'Zahid Khan',
      paperSize: 'A4',
      itemsCsv,
    });

    expect(result.itemsImportError).toBeNull();
    expect(result.itemsImport).not.toBeNull();
    expect(result.itemsImport?.itemsAccepted).toBeGreaterThan(0);

    const db = openDatabase(dbPath);
    const row = db
      .prepare('SELECT COUNT(*) as count FROM item WHERE tenant_id = ?')
      .get(TENANT_ID) as {
      count: number;
    };
    db.close();
    expect(row.count).toBe(result.itemsImport?.itemsAccepted);
  });

  it('with a CSV that has invalid rows: completes anyway, reports the rejected rows, tenant/settings are still written', async () => {
    const itemsCsv = readFileSync(itemsFixturePath, 'utf8');

    const result = await finishSetup(deps, {
      shopName: 'Malakand AC',
      ownerName: 'Zahid Khan',
      paperSize: 'A4',
      itemsCsv,
    });

    // This fixture (shared with import.handler.test.ts) deliberately
    // mixes valid rows with bad-category/bad-business-unit/no-price
    // rows — "completes anyway" means both counts are non-zero, not
    // that the import silently succeeded end to end.
    expect(result.itemsImportError).toBeNull();
    expect(result.itemsImport?.itemsAccepted).toBeGreaterThan(0);
    expect(result.itemsImport?.itemsRejected).toBeGreaterThan(0);

    const db = openDatabase(dbPath);
    const tenantExists = hasTenant(db, TENANT_ID);
    db.close();
    expect(tenantExists).toBe(true);
  });

  it('with a CSV the import step cannot parse at all: completes anyway, tenant/settings are still written, the error is reported not thrown', async () => {
    const result = await finishSetup(deps, {
      shopName: 'Malakand AC',
      ownerName: 'Zahid Khan',
      paperSize: 'A4',
      // No header row this CSV parser recognises — parseCsv throws,
      // but the wizard's own setup must not fail because of it (the
      // owner's explicit instruction: "CSV import errors must not
      // block setup completion").
      itemsCsv: 'not,a,real,header\n1,2,3,4\n',
    });

    expect(result.itemsImport).toBeNull();
    expect(result.itemsImportError).toBeTruthy();

    const db = openDatabase(dbPath);
    const tenantExists = hasTenant(db, TENANT_ID);
    db.close();
    expect(tenantExists).toBe(true);
  });
});
