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
import { KyselyPaymentRepository } from './payment.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';
const SEEDED_BALANCE_PAISA = 2000000; // Rs 20,000 owed to the shop

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let paymentRepo: KyselyPaymentRepository;
let customerId: string;

function partyBalance(partyId: string): number {
  const row = rawDb
    .prepare(`SELECT balance_paisa FROM v_party_balance WHERE party_id = ?`)
    .get(partyId) as { balance_paisa: number } | undefined;
  return row?.balance_paisa ?? 0;
}

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-payment-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  paymentRepo = new KyselyPaymentRepository(kysely, TENANT_ID, DEVICE_CODE);
  const partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);

  const customer = await partyRepo.createCustomer({
    partyCode: null,
    name: 'Naeem Fridge Repairs',
    shopName: null,
    phone: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: null,
    notes: null,
  });
  customerId = customer.id;

  // Pre-existing balance: customer already owes Rs 20,000, per CF-2's
  // sign convention (+ve = party owes shop more).
  rawDb
    .prepare(
      `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, source_type, source_id, created_at)
       VALUES (?, ?, ?, ?, 'sale', ?, 'sale', ?, ?)`,
    )
    .run(
      newId(),
      TENANT_ID,
      customerId,
      '2026-08-20',
      SEEDED_BALANCE_PAISA,
      newId(),
      new Date().toISOString(),
    );
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyPaymentRepository.createPayment', () => {
  it('test 1 — payment reduces balance by exactly the payment amount', async () => {
    // v_party_balance before: +2,000,000
    const before = partyBalance(customerId);
    expect(before).toBe(2000000);

    await paymentRepo.createPayment({
      partyId: customerId,
      amountPaisa: 500000,
      method: 'cash',
      paymentDate: '2026-08-26',
      referenceNo: null,
      notes: null,
    });

    // party_ledger delta:    -500,000
    // v_party_balance after: +2,000,000 - 500,000 = +1,500,000 (Rs 15,000 still owed)
    const after = partyBalance(customerId);
    expect(after).toBe(1500000);
  });

  it('test 2 — party_ledger row sign is negative', async () => {
    const result = await paymentRepo.createPayment({
      partyId: customerId,
      amountPaisa: 500000,
      method: 'cash',
      paymentDate: '2026-08-26',
      referenceNo: null,
      notes: null,
    });

    const ledgerRow = rawDb
      .prepare(`SELECT entry_type, amount FROM party_ledger WHERE source_id = ?`)
      .get(result.id) as { entry_type: string; amount: number };
    expect(ledgerRow.entry_type).toBe('payment_received');
    expect(ledgerRow.amount).toBe(-500000);
  });

  it('test 3 — payment table row is positive with direction=in', async () => {
    // payment.amount is always the unsigned magnitude; payment.direction
    // carries the sign information. party_ledger.amount for the same
    // event is negative. Never sum these two columns together —
    // incompatible conventions. Phase 4 cash-book reads payment.amount
    // WHERE direction='in' for cash-in totals.
    const result = await paymentRepo.createPayment({
      partyId: customerId,
      amountPaisa: 500000,
      method: 'cash',
      paymentDate: '2026-08-26',
      referenceNo: null,
      notes: null,
    });

    const paymentRow = rawDb
      .prepare(`SELECT amount, direction FROM payment WHERE id = ?`)
      .get(result.id) as { amount: number; direction: string };
    expect(paymentRow.amount).toBe(500000);
    expect(paymentRow.direction).toBe('in');
  });

  it('createPayment generates RCP-NNNN doc_no', async () => {
    // doc_type='payment_in' after migration 0006, prefix='RCP'.
    // First payment on a fresh DB: nextNumber=1, formatDisplayDocNumber('RCP', 1) = 'RCP-0001'
    const result = await paymentRepo.createPayment({
      partyId: customerId,
      amountPaisa: 500000,
      method: 'cash',
      paymentDate: '2026-08-26',
      referenceNo: null,
      notes: null,
    });

    expect(result.docNo).toBe('RCP-0001');
  });
});
