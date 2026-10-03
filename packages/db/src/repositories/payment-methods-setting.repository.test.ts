import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyPaymentRepository } from './payment.repository.js';
import { getCustomerLedger } from './customer-ledger.repository.js';
import {
  getPaymentMethodsEnabled,
  setPaymentMethodBankEnabled,
  setPaymentMethodCashEnabled,
  setPaymentMethodChequeEnabled,
  setPaymentMethodEasypaisaEnabled,
  setPaymentMethodJazzcashEnabled,
} from './payment-methods-setting.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: ReturnType<typeof createKyselyDb>;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-payment-methods-setting-repo-test-'));
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

/**
 * P17-7 (docs/phases/PHASE_17.md §2.6/§8, S17-EXP-4, A17-5).
 */
describe('getPaymentMethodsEnabled (defaults — fresh DB)', () => {
  it('all five default to true when no setting row has ever been written', async () => {
    const value = await getPaymentMethodsEnabled(kysely, TENANT_ID);
    expect(value).toEqual({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });

    const row = rawDb
      .prepare(
        `SELECT COUNT(*) AS n FROM setting WHERE tenant_id = ? AND key LIKE 'paymentMethod%'`,
      )
      .get(TENANT_ID) as { n: number };
    expect(row.n).toBe(0); // reading the defaults never writes a row
  });
});

describe('setPaymentMethod*Enabled (non-cash methods, both directions)', () => {
  it('disabling bank is reflected by getPaymentMethodsEnabled, others stay true', async () => {
    await setPaymentMethodBankEnabled(kysely, TENANT_ID, false);

    const value = await getPaymentMethodsEnabled(kysely, TENANT_ID);
    expect(value).toEqual({
      cash: true,
      bank: false,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });
  });

  it('re-enabling a disabled method flips it back to true', async () => {
    await setPaymentMethodEasypaisaEnabled(kysely, TENANT_ID, false);
    await setPaymentMethodEasypaisaEnabled(kysely, TENANT_ID, true);

    const value = await getPaymentMethodsEnabled(kysely, TENANT_ID);
    expect(value.easypaisa).toBe(true);
  });

  it('setting jazzcash and cheque independently does not affect each other', async () => {
    await setPaymentMethodJazzcashEnabled(kysely, TENANT_ID, false);
    await setPaymentMethodChequeEnabled(kysely, TENANT_ID, false);

    const value = await getPaymentMethodsEnabled(kysely, TENANT_ID);
    expect(value).toEqual({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: false,
      cheque: false,
    });
  });

  it('setting twice updates the same row rather than inserting a duplicate', async () => {
    await setPaymentMethodBankEnabled(kysely, TENANT_ID, false);
    await setPaymentMethodBankEnabled(kysely, TENANT_ID, true);

    const rows = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'paymentMethodBankEnabled'`)
      .all(TENANT_ID) as Array<{ value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('true');
  });
});

describe('setPaymentMethodCashEnabled (A17-5 — cash can never be disabled)', () => {
  it('accepts true (a no-op, since true is already the default)', async () => {
    await expect(setPaymentMethodCashEnabled(kysely, TENANT_ID, true)).resolves.toBeUndefined();
    const value = await getPaymentMethodsEnabled(kysely, TENANT_ID);
    expect(value.cash).toBe(true);
  });

  // TypeScript itself refuses `setPaymentMethodCashEnabled(kysely, TENANT_ID, false)` at
  // compile time (the parameter's type is the literal `true`, not `boolean`) — the
  // authoritative runtime rejection for a real `false` payload is
  // SetPaymentMethodCashEnabledInput.parse({ value: false }), covered in
  // packages/contracts/src/setting/setting.test.ts.
});

/**
 * Priority tests (§8): a historical payment row whose method is later
 * disabled in Settings still displays correctly everywhere — this
 * setting is picker-only, never enforced server-side, never touches a
 * stored historical payment.method value.
 */
describe('disabling a payment method never touches a historical payment row (picker-only, §8)', () => {
  it("an easypaisa payment's stored method is unchanged after easypaisa is disabled", async () => {
    const partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
    const paymentRepo = new KyselyPaymentRepository(kysely, TENANT_ID, DEVICE_CODE);
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Naeem Fridge Repairs',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });

    const payment = await paymentRepo.createPayment({
      partyId: customer.id,
      amountPaisa: 50000,
      method: 'easypaisa',
      paymentDate: '2026-09-10',
      referenceNo: 'TXN-123',
      notes: null,
    });

    await setPaymentMethodEasypaisaEnabled(kysely, TENANT_ID, false);

    const row = rawDb.prepare(`SELECT method FROM payment WHERE id = ?`).get(payment.id) as {
      method: string;
    };
    expect(row.method).toBe('easypaisa');

    const ledger = await getCustomerLedger(kysely, TENANT_ID, customer.id);
    const ledgerRow = ledger.find((r) => r.sourceId === payment.id);
    expect(ledgerRow?.paymentMethod).toBe('easypaisa');
  });

  it('insert a payment with a disabled method directly (bypassing any picker) — the write path itself never checks this setting', async () => {
    const partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
    const paymentRepo = new KyselyPaymentRepository(kysely, TENANT_ID, DEVICE_CODE);
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Malik Traders',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });

    await setPaymentMethodJazzcashEnabled(kysely, TENANT_ID, false);

    await expect(
      paymentRepo.createPayment({
        partyId: customer.id,
        amountPaisa: 20000,
        method: 'jazzcash',
        paymentDate: '2026-09-11',
        referenceNo: null,
        notes: null,
      }),
    ).resolves.toMatchObject({ method: 'jazzcash' });
  });
});
