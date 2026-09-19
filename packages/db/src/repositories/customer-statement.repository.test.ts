import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyPartyRepository } from './party.repository.js';
import { getCustomerStatementData } from './customer-ledger.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: ReturnType<typeof createKyselyDb>;
let partyRepo: KyselyPartyRepository;

function insertLedgerEntry(
  customerId: string,
  entryDate: string,
  entryType: string,
  amountPaisa: number,
): void {
  rawDb
    .prepare(
      `INSERT INTO party_ledger
         (id, tenant_id, party_id, entry_date, entry_type, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      TENANT_ID,
      customerId,
      entryDate,
      entryType,
      amountPaisa,
      new Date().toISOString(),
    );
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-customer-statement-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('getCustomerStatementData (CL-8A)', () => {
  it('opening balance = sum of rows strictly before fromDate', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Statement Customer',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    insertLedgerEntry(customer.id, '2026-08-15', 'sale', 20000);
    insertLedgerEntry(customer.id, '2026-08-15', 'sale', 10000);
    insertLedgerEntry(customer.id, '2026-09-05', 'sale', 5000);

    const statement = await getCustomerStatementData(
      kysely,
      TENANT_ID,
      customer.id,
      '2026-09-01',
      '2026-09-30',
    );

    // 20,000 + 10,000 = 30,000
    // The 2026-09-05 row is on or after fromDate — excluded from opening
    expect(statement?.openingBalancePaisa).toBe(30000);
  });

  it('rows returned are only within the date range (inclusive on both ends)', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Statement Customer 2',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    insertLedgerEntry(customer.id, '2026-08-15', 'sale', 20000);
    insertLedgerEntry(customer.id, '2026-08-15', 'sale', 10000);
    insertLedgerEntry(customer.id, '2026-09-05', 'sale', 5000);

    const statement = await getCustomerStatementData(
      kysely,
      TENANT_ID,
      customer.id,
      '2026-09-01',
      '2026-09-30',
    );

    expect(statement?.rows).toHaveLength(1);
    expect(statement?.rows[0]?.amountPaisa).toBe(5000);
  });

  it('closing balance is calculated correctly', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Statement Customer 3',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    insertLedgerEntry(customer.id, '2026-08-15', 'sale', 20000);
    insertLedgerEntry(customer.id, '2026-08-15', 'sale', 10000);
    insertLedgerEntry(customer.id, '2026-09-05', 'sale', 5000);

    const statement = await getCustomerStatementData(
      kysely,
      TENANT_ID,
      customer.id,
      '2026-09-01',
      '2026-09-30',
    );

    // 30,000 (opening) + 5,000 (rows sum) = 35,000
    expect(statement?.closingBalancePaisa).toBe(35000);
  });

  it('returns null when the customer does not exist', async () => {
    const statement = await getCustomerStatementData(
      kysely,
      TENANT_ID,
      newId(),
      '2026-09-01',
      '2026-09-30',
    );
    expect(statement).toBeNull();
  });
});
