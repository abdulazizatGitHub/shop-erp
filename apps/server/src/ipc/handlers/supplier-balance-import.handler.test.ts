import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportSupplierBalanceInput } from '@shop/contracts';
import { openDatabase, migrate, seed, createKyselyDb, KyselyPartyRepository } from '@shop/db';
import {
  runSupplierBalanceImport,
  type SupplierBalanceImportHandlerDeps,
} from './supplier-balance-import.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const supplierBalanceFixturePath = path.join(
  import.meta.dirname,
  '../../../../../packages/core/src/import/__fixtures__/supplier_balances.csv',
);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let deps: SupplierBalanceImportHandlerDeps;

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-supplier-balance-handler-test-'));
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

  // The fixture CSV's matched row names "Metro Refrigeration Traders" —
  // must exist as a real supplier before the import can match it, same
  // precedent as packages/db's import.repository.test.ts.
  const partyRepo = new KyselyPartyRepository(createKyselyDb(rawDb), TENANT_ID, DEVICE_CODE);
  await partyRepo.createSupplier({
    partyCode: null,
    name: 'Metro Refrigeration Traders',
    shopName: null,
    phone: '03001234567',
    cityArea: null,
    paymentTerms: null,
    notes: null,
  });
  rawDb.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('runSupplierBalanceImport (Option B — receives CSV content directly, no file path)', () => {
  it('valid balancesCsv, commit=true: parses, validates, and posts real party_ledger rows', async () => {
    const balancesCsv = readFileSync(supplierBalanceFixturePath, 'utf8');

    const result = await runSupplierBalanceImport(deps, balancesCsv, true);

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
    const balancesCsv = readFileSync(supplierBalanceFixturePath, 'utf8');

    const result = await runSupplierBalanceImport(deps, balancesCsv, false);
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

    await expect(runSupplierBalanceImport(deps, garbageCsv, true)).rejects.toThrow(
      /Could not find a header row/,
    );
  });

  it('a supplier name with no match is rejected, not silently skipped or accepted', async () => {
    const balancesCsv = readFileSync(supplierBalanceFixturePath, 'utf8');

    const result = await runSupplierBalanceImport(deps, balancesCsv, true);

    // Fixture's second row ("Nonexistent Supplier XYZ") has no matching
    // supplier — validateSupplierBalanceRows rejects it (see
    // packages/core/src/import/supplier-balance-import.test.ts).
    expect(result.rejected).toBe(1);
  });

  it('the report is written only to logDir, not next to a source file — there is no source path under Option B', async () => {
    const balancesCsv = readFileSync(supplierBalanceFixturePath, 'utf8');

    const result = await runSupplierBalanceImport(deps, balancesCsv, true);

    expect(result.reportPath).toBe(result.logReportPath);
    expect(result.reportPath.startsWith(deps.logDir)).toBe(true);
  });
});

describe('ImportSupplierBalanceInput (Zod schema)', () => {
  it('accepts a payload with balancesCsv', () => {
    expect(() => ImportSupplierBalanceInput.parse({ balancesCsv: 'a,b,c' })).not.toThrow();
  });

  it('rejects a payload missing balancesCsv', () => {
    expect(() => ImportSupplierBalanceInput.parse({})).toThrow();
  });

  it('rejects an empty balancesCsv string', () => {
    expect(() => ImportSupplierBalanceInput.parse({ balancesCsv: '' })).toThrow();
  });
});
