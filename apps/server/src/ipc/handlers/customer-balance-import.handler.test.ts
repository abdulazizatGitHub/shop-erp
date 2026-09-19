import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportCustomerBalanceInput } from '@shop/contracts';
import { openDatabase, migrate, seed, createKyselyDb, KyselyPartyRepository } from '@shop/db';
import {
  runCustomerBalanceImport,
  type CustomerBalanceImportHandlerDeps,
} from './customer-balance-import.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const customerBalanceFixturePath = path.join(
  import.meta.dirname,
  '../../../../../packages/core/src/import/__fixtures__/customer_balances.csv',
);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let deps: CustomerBalanceImportHandlerDeps;

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-customer-balance-handler-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  deps = {
    dbPath,
    tenantId: TENANT_ID,
    deviceCode: DEVICE_CODE,
    logDir: path.join(workDir, 'logs'),
  };

  // The fixture CSV's matched row names "Ali Traders" — must exist as a
  // real customer before the import can match it, same precedent as
  // supplier-balance-import.handler.test.ts.
  const partyRepo = new KyselyPartyRepository(createKyselyDb(rawDb), TENANT_ID, DEVICE_CODE);
  await partyRepo.createCustomer({
    partyCode: null,
    name: 'Ali Traders',
    shopName: null,
    phone: '0300-1234567',
    address: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: null,
    notes: null,
  });
  rawDb.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('runCustomerBalanceImport (Option B — receives CSV content directly, no file path)', () => {
  it('valid balancesCsv, commit=true: parses, validates, and posts real party_ledger rows', async () => {
    const balancesCsv = readFileSync(customerBalanceFixturePath, 'utf8');

    const result = await runCustomerBalanceImport(deps, balancesCsv, true);

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.reportPath).toBeTruthy();

    const db = openDatabase(dbPath);
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM party_ledger WHERE tenant_id = ? AND entry_type = 'opening_balance'",
      )
      .get(TENANT_ID) as { count: number };
    db.close();
    expect(row.count).toBe(1);
  });

  it('valid balancesCsv, commit=false (dry run): validates but posts nothing', async () => {
    const balancesCsv = readFileSync(customerBalanceFixturePath, 'utf8');

    const result = await runCustomerBalanceImport(deps, balancesCsv, false);
    expect(result.accepted).toBe(1);

    const db = openDatabase(dbPath);
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM party_ledger WHERE tenant_id = ? AND entry_type = 'opening_balance'",
      )
      .get(TENANT_ID) as { count: number };
    db.close();
    expect(row.count).toBe(0);
  });

  it('a CSV with no recognizable header row (core-level failure) rejects, does not silently succeed', async () => {
    const garbageCsv = 'not,a,real,header\n1,2,3,4';

    await expect(runCustomerBalanceImport(deps, garbageCsv, true)).rejects.toThrow(
      /Could not find a header row/,
    );
  });

  it('a customer name with no match is rejected, not silently skipped or accepted', async () => {
    const balancesCsv = readFileSync(customerBalanceFixturePath, 'utf8');

    const result = await runCustomerBalanceImport(deps, balancesCsv, true);

    // Fixture's second row ("Unknown Shop") has no matching customer —
    // validateCustomerBalanceRows rejects it.
    expect(result.rejected).toBe(1);
  });
});

describe('ImportCustomerBalanceInput (Zod schema)', () => {
  it('accepts a payload with balancesCsv', () => {
    expect(() => ImportCustomerBalanceInput.parse({ balancesCsv: 'a,b,c' })).not.toThrow();
  });

  it('rejects a payload missing balancesCsv', () => {
    expect(() => ImportCustomerBalanceInput.parse({})).toThrow();
  });

  it('rejects an empty balancesCsv string', () => {
    expect(() => ImportCustomerBalanceInput.parse({ balancesCsv: '' })).toThrow();
  });
});
