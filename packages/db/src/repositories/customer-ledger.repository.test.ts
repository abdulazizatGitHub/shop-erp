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
import { getCustomerLedger } from './customer-ledger.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: ReturnType<typeof createKyselyDb>;
let partyRepo: KyselyPartyRepository;
let warehouseId: string;
let priceLevelId: string;

function insertSale(
  customerId: string,
  saleDate: string,
  totalAmountPaisa: number,
  overrides: { paidAmountPaisa?: number; discountAmountPaisa?: number; status?: string } = {},
): string {
  const id = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO sale
         (id, tenant_id, doc_no, customer_id, warehouse_id, price_level_id, sale_date,
          sale_type, subtotal, discount_amount, tax_amount, total_amount, paid_amount,
          payment_mode, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'counter', ?, ?, 0, ?, ?, 'credit', ?, ?, ?)`,
    )
    .run(
      id,
      TENANT_ID,
      `INV-${id}`,
      customerId,
      warehouseId,
      priceLevelId,
      saleDate,
      totalAmountPaisa,
      overrides.discountAmountPaisa ?? 0,
      totalAmountPaisa,
      overrides.paidAmountPaisa ?? 0,
      overrides.status ?? 'confirmed',
      now,
      now,
    );
  return id;
}

function insertPayment(customerId: string, paymentDate: string, amountPaisa: number): string {
  const id = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO payment
         (id, tenant_id, doc_no, direction, party_id, payment_date, amount, method, created_at)
       VALUES (?, ?, ?, 'in', ?, ?, ?, 'cash', ?)`,
    )
    .run(id, TENANT_ID, `REC-${id}`, customerId, paymentDate, amountPaisa, now);
  return id;
}

function insertLedgerEntry(
  customerId: string,
  entryDate: string,
  entryType: string,
  amountPaisa: number,
  sourceType: string,
  sourceId: string,
): void {
  rawDb
    .prepare(
      `INSERT INTO party_ledger
         (id, tenant_id, party_id, entry_date, entry_type, amount, source_type, source_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      TENANT_ID,
      customerId,
      entryDate,
      entryType,
      amountPaisa,
      sourceType,
      sourceId,
      new Date().toISOString(),
    );
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-customer-ledger-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);

  const warehouse = rawDb
    .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
    .get(TENANT_ID) as { id: string };
  const retailLevel = rawDb
    .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'`)
    .get(TENANT_ID) as { id: string };
  warehouseId = warehouse.id;
  priceLevelId = retailLevel.id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('getCustomerLedger (CL-1)', () => {
  it('returns [] for a customer with an empty ledger', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'No History Customer',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });

    const rows = await getCustomerLedger(kysely, TENANT_ID, customer.id);
    expect(rows).toEqual([]);
  });

  it('a credit sale row has saleDocNo populated, paymentDocNo null, amountPaisa > 0', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Credit Sale Customer',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    const saleId = insertSale(customer.id, '2026-09-01', 50000);
    insertLedgerEntry(customer.id, '2026-09-01', 'sale', 50000, 'sale', saleId);

    const rows = await getCustomerLedger(kysely, TENANT_ID, customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.saleDocNo).not.toBeNull();
    expect(rows[0]?.paymentDocNo).toBeNull();
    expect(rows[0]?.amountPaisa).toBeGreaterThan(0);
  });

  it('a payment row has paymentDocNo populated, saleDocNo null, amountPaisa < 0', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Payment Customer',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    const paymentId = insertPayment(customer.id, '2026-09-10', 20000);
    insertLedgerEntry(customer.id, '2026-09-10', 'payment_received', -20000, 'payment', paymentId);

    const rows = await getCustomerLedger(kysely, TENANT_ID, customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.paymentDocNo).not.toBeNull();
    expect(rows[0]?.saleDocNo).toBeNull();
    expect(rows[0]?.amountPaisa).toBeLessThan(0);
  });

  it('running balance accumulates correctly across a sale then a payment', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Running Balance Customer',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    const saleId = insertSale(customer.id, '2026-09-01', 50000);
    insertLedgerEntry(customer.id, '2026-09-01', 'sale', 50000, 'sale', saleId);
    const paymentId = insertPayment(customer.id, '2026-09-10', 20000);
    insertLedgerEntry(customer.id, '2026-09-10', 'payment_received', -20000, 'payment', paymentId);

    const rows = await getCustomerLedger(kysely, TENANT_ID, customer.id);
    // 50,000 + (-20,000) = 30,000 paisa
    expect(rows[0]?.runningBalancePaisa).toBe(30000);
  });

  it('orders newest date first — a row on a later date is result[0]', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Date Order Customer',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    const olderSaleId = insertSale(customer.id, '2026-09-01', 10000);
    insertLedgerEntry(customer.id, '2026-09-01', 'sale', 10000, 'sale', olderSaleId);
    const newerSaleId = insertSale(customer.id, '2026-09-15', 20000);
    insertLedgerEntry(customer.id, '2026-09-15', 'sale', 20000, 'sale', newerSaleId);

    const rows = await getCustomerLedger(kysely, TENANT_ID, customer.id);
    expect(rows[0]?.entryDate).toBe('2026-09-15');
    expect(rows[1]?.entryDate).toBe('2026-09-01');
  });

  // Phase 13 polish series: CustomerLedgerTable.tsx's "All / Sales /
  // Payments" filter chips filter client-side on `sourceType` — this
  // confirms the data shape that UI filter depends on, not the UI
  // itself (the UI's own filtering is plain Array.filter, not worth a
  // repository test on its own).
  it('sourceType lets the caller separate sale rows from payment rows', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Mixed Ledger Customer',
      shopName: null,
      phone: null,
      address: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    const saleId = insertSale(customer.id, '2026-09-01', 50000);
    insertLedgerEntry(customer.id, '2026-09-01', 'sale', 50000, 'sale', saleId);
    const paymentId = insertPayment(customer.id, '2026-09-10', 20000);
    insertLedgerEntry(customer.id, '2026-09-10', 'payment_received', -20000, 'payment', paymentId);

    const rows = await getCustomerLedger(kysely, TENANT_ID, customer.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.sourceType === 'sale')).toHaveLength(1);
    expect(rows.filter((r) => r.sourceType === 'payment')).toHaveLength(1);
  });
});
