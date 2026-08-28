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

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyPartyRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-party-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyPartyRepository.createSupplier', () => {
  it('auto-generates a supplier code when none is given, format SUP-0001', async () => {
    const result = await repo.createSupplier({
      partyCode: null,
      name: 'Metro Refrigeration Traders',
      shopName: 'Metro Traders',
      phone: '03001234567',
      cityArea: 'Malakand Bazaar',
      paymentTerms: 'Net 15',
      notes: 'Main compressor supplier',
    });

    expect(result.partyCode).toBe('SUP-0001');

    const row = rawDb.prepare(`SELECT * FROM party WHERE id = ?`).get(result.id) as Record<
      string,
      unknown
    >;
    expect(row['party_type']).toBe('supplier');
    expect(row['name']).toBe('Metro Refrigeration Traders');
    expect(row['shop_name']).toBe('Metro Traders');
    expect(row['phone']).toBe('03001234567');
    expect(row['city_area']).toBe('Malakand Bazaar');
    expect(row['payment_terms']).toBe('Net 15');
    expect(row['notes']).toBe('Main compressor supplier');
    expect(row['party_code']).toBe('SUP-0001');
    expect(row['is_active']).toBe(1);
  });

  it('increments the sequence on the second auto-generated code', async () => {
    const first = await repo.createSupplier({
      partyCode: null,
      name: 'Supplier One',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });
    const second = await repo.createSupplier({
      partyCode: null,
      name: 'Supplier Two',
      shopName: null,
      phone: '0301',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });

    expect(first.partyCode).toBe('SUP-0001');
    expect(second.partyCode).toBe('SUP-0002');
  });

  it('respects an explicit party code and does not touch the sequence', async () => {
    const result = await repo.createSupplier({
      partyCode: 'HAND-ENTERED-001',
      name: 'Manually Coded Supplier',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });

    expect(result.partyCode).toBe('HAND-ENTERED-001');

    const next = await repo.createSupplier({
      partyCode: null,
      name: 'Auto After Manual',
      shopName: null,
      phone: '0301',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });
    // sequence must still start at 1 — explicit codes don't consume it
    expect(next.partyCode).toBe('SUP-0001');
  });

  it('createSupplier generates SUP-NNNN party_code', async () => {
    // First supplier on a fresh DB: nextNumber=1, formatDisplayDocNumber('SUP', 1) = 'SUP-0001'
    const result = await repo.createSupplier({
      partyCode: null,
      name: 'Format Check Supplier',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });

    expect(result.partyCode).toBe('SUP-0001');
  });

  it('rejects a duplicate party code via the UNIQUE constraint', async () => {
    await repo.createSupplier({
      partyCode: 'DUP-001',
      name: 'First',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });

    await expect(
      repo.createSupplier({
        partyCode: 'DUP-001',
        name: 'Second',
        shopName: null,
        phone: '0301',
        cityArea: null,
        paymentTerms: null,
        notes: null,
      }),
    ).rejects.toThrow();
  });

  it('does not use the item document_sequence — item and supplier codes are independent', async () => {
    rawDb
      .prepare(
        `INSERT INTO document_sequence (tenant_id, doc_type, prefix, device_code, next_number)
         VALUES (?, 'item', 'ITM', 'A', 5)`,
      )
      .run(TENANT_ID);

    const result = await repo.createSupplier({
      partyCode: null,
      name: 'Independent Sequence Supplier',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });

    expect(result.partyCode).toBe('SUP-0001');
  });
});

describe('KyselyPartyRepository.getSupplierById / searchSuppliers', () => {
  it('round-trips a created supplier through getSupplierById', async () => {
    const created = await repo.createSupplier({
      partyCode: null,
      name: 'Round Trip Supplier',
      shopName: 'Round Trip Shop',
      phone: '03009999999',
      cityArea: 'Dargai',
      paymentTerms: 'Cash on delivery',
      notes: 'Reliable, fast delivery',
    });

    const fetched = await repo.getSupplierById(created.id);
    expect(fetched).toEqual({
      id: created.id,
      partyCode: created.partyCode,
      name: 'Round Trip Supplier',
      shopName: 'Round Trip Shop',
      phone: '03009999999',
      cityArea: 'Dargai',
      paymentTerms: 'Cash on delivery',
      notes: 'Reliable, fast delivery',
    });
  });

  it('returns null for a missing id', async () => {
    const fetched = await repo.getSupplierById('00000000-0000-0000-0000-000000000099');
    expect(fetched).toBeNull();
  });

  it('does not return a non-supplier party by id (customer/staff excluded)', async () => {
    const customerId = '11111111-0000-1000-8000-000000000001';
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_code, party_type, name, is_active, created_at, updated_at)
         VALUES (?, ?, 'CUST-A-000001', 'customer', 'A Walk-in Customer', 1, ?, ?)`,
      )
      .run(customerId, TENANT_ID, new Date().toISOString(), new Date().toISOString());

    const fetched = await repo.getSupplierById(customerId);
    expect(fetched).toBeNull();
  });

  it('finds suppliers by partial name match', async () => {
    await repo.createSupplier({
      partyCode: null,
      name: 'Al-Madina Compressor House',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });
    await repo.createSupplier({
      partyCode: null,
      name: 'Swat Gas Traders',
      shopName: null,
      phone: '0301',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });

    const results = await repo.searchSuppliers({ query: 'Compressor' });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Al-Madina Compressor House');
  });

  it('excludes non-supplier parties from search', async () => {
    await repo.createSupplier({
      partyCode: null,
      name: 'Matching Name Supplier',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_code, party_type, name, is_active, created_at, updated_at)
         VALUES (?, ?, 'CUST-A-000001', 'customer', 'Matching Name Customer', 1, ?, ?)`,
      )
      .run(
        '22222222-0000-1000-8000-000000000001',
        TENANT_ID,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const results = await repo.searchSuppliers({ query: 'Matching Name' });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Matching Name Supplier');
  });
});

describe('document_sequence concurrency — does racing createSupplier ever produce a duplicate party_code?', () => {
  // createSupplier's nextSupplierCode has the same read-then-write shape
  // (SELECT nextNumber, then UPDATE/INSERT) as cancelPurchase's status
  // check — investigated because BUG-15 (PROJECT.md) proved that shape
  // can race. Measured, not reasoned about: fire many concurrent creates
  // and check both the returned codes AND what actually persisted in the
  // DB for any duplicate — the UNIQUE(tenant_id, party_code) constraint
  // would only stop a duplicate from being INSERTed, not from being
  // computed and briefly believed valid by two callers.
  it('same connection: N concurrent creates all succeed with unique sequential codes', async () => {
    const N = 8;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        repo.createSupplier({
          partyCode: null,
          name: `Race Supplier ${String(i)}`,
          shopName: null,
          phone: '0300',
          cityArea: null,
          paymentTerms: null,
          notes: null,
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(N);

    const codes = fulfilled.map(
      (r) => (r as PromiseFulfilledResult<{ partyCode: string }>).value.partyCode,
    );
    expect(new Set(codes).size).toBe(N);

    const dbRows = rawDb
      .prepare(`SELECT party_code FROM party WHERE tenant_id = ?`)
      .all(TENANT_ID) as Array<{ party_code: string }>;
    expect(new Set(dbRows.map((r) => r.party_code)).size).toBe(dbRows.length);
  });

  it('separate connections (the real IPC pattern): losers fail outright with SQLITE_BUSY — never a duplicate code, in the DB or returned', async () => {
    const N = 8;
    const conns = Array.from({ length: N }, () => openDatabase(dbPath));
    try {
      const results = await Promise.allSettled(
        conns.map((db, i) =>
          new KyselyPartyRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE).createSupplier({
            partyCode: null,
            name: `Race Supplier ${String(i)}`,
            shopName: null,
            phone: '0300',
            cityArea: null,
            paymentTerms: null,
            notes: null,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const codes = fulfilled.map(
        (r) => (r as PromiseFulfilledResult<{ partyCode: string }>).value.partyCode,
      );
      // The real invariant: whatever subset succeeds, every succeeding
      // code is unique — never two callers both believing they got the
      // same code.
      expect(new Set(codes).size).toBe(codes.length);

      const dbRows = rawDb
        .prepare(`SELECT party_code FROM party WHERE tenant_id = ?`)
        .all(TENANT_ID) as Array<{ party_code: string }>;
      expect(new Set(dbRows.map((r) => r.party_code)).size).toBe(dbRows.length);
      // Matches the DB, not just the returned values — the ground truth.
      expect(dbRows).toHaveLength(fulfilled.length);
    } finally {
      for (const db of conns) db.close();
    }
  });
});

describe('KyselyPartyRepository — customer', () => {
  function retailPriceLevelId(): string {
    const row = rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'`)
      .get(TENANT_ID) as { id: string };
    return row.id;
  }

  it('creates a customer, CUS-0001, every field matches input — queried from the party table directly', async () => {
    const priceLevelId = retailPriceLevelId();

    const result = await repo.createCustomer({
      partyCode: null,
      name: 'Naeem Fridge Repairs',
      shopName: 'Naeem Electronics',
      phone: '03007654321',
      customerType: 'retail',
      priceLevelId,
      creditLimitPaisa: 500000,
      notes: 'Pays on the 1st of every month',
    });

    expect(result.partyCode).toBe('CUS-0001');

    const row = rawDb.prepare(`SELECT * FROM party WHERE id = ?`).get(result.id) as Record<
      string,
      unknown
    >;
    expect(row['party_type']).toBe('customer');
    expect(row['party_code']).toBe('CUS-0001');
    expect(row['name']).toBe('Naeem Fridge Repairs');
    expect(row['shop_name']).toBe('Naeem Electronics');
    expect(row['phone']).toBe('03007654321');
    expect(row['customer_type']).toBe('retail');
    expect(row['price_level_id']).toBe(priceLevelId);
    expect(row['credit_limit']).toBe(500000);
    expect(row['notes']).toBe('Pays on the 1st of every month');
    expect(row['is_active']).toBe(1);
  });

  it('second customer gets CUS-0002 — sequence increments', async () => {
    const first = await repo.createCustomer({
      partyCode: null,
      name: 'Customer One',
      shopName: null,
      phone: '0300',
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    const second = await repo.createCustomer({
      partyCode: null,
      name: 'Customer Two',
      shopName: null,
      phone: '0301',
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });

    expect(first.partyCode).toBe('CUS-0001');
    expect(second.partyCode).toBe('CUS-0002');
  });

  it('createCustomer generates CUS-NNNN party_code', async () => {
    // First customer on a fresh DB: nextNumber=1, formatDisplayDocNumber('CUS', 1) = 'CUS-0001'
    const result = await repo.createCustomer({
      partyCode: null,
      name: 'Format Check Customer',
      shopName: null,
      phone: null,
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });

    expect(result.partyCode).toBe('CUS-0001');
  });

  it('respects an explicit party code and does not consume the sequence', async () => {
    const explicit = await repo.createCustomer({
      partyCode: 'WALKIN-HAND-CODED',
      name: 'Hand Coded Customer',
      shopName: null,
      phone: null,
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    expect(explicit.partyCode).toBe('WALKIN-HAND-CODED');

    const nextRow = rawDb
      .prepare(
        `SELECT next_number FROM document_sequence WHERE tenant_id = ? AND doc_type = 'customer' AND device_code = 'A'`,
      )
      .get(TENANT_ID) as { next_number: number } | undefined;
    // No row at all is equally valid proof — the sequence was never
    // touched by an explicit code, exactly like createSupplier's
    // equivalent test.
    expect(nextRow === undefined || nextRow.next_number === 1).toBe(true);

    const auto = await repo.createCustomer({
      partyCode: null,
      name: 'Auto After Manual',
      shopName: null,
      phone: null,
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    expect(auto.partyCode).toBe('CUS-0001');
  });

  it('rejects a duplicate party code via the UNIQUE constraint', async () => {
    await repo.createCustomer({
      partyCode: 'DUP-CUST-001',
      name: 'First',
      shopName: null,
      phone: null,
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });

    await expect(
      repo.createCustomer({
        partyCode: 'DUP-CUST-001',
        name: 'Second',
        shopName: null,
        phone: null,
        customerType: null,
        priceLevelId: null,
        creditLimitPaisa: null,
        notes: null,
      }),
    ).rejects.toThrow();
  });

  it('search returns only customer-type rows, never supplier or staff', async () => {
    await repo.createCustomer({
      partyCode: null,
      name: 'Matching Customer',
      shopName: null,
      phone: null,
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    await repo.createSupplier({
      partyCode: null,
      name: 'Matching Supplier',
      shopName: null,
      phone: '0300',
      cityArea: null,
      paymentTerms: null,
      notes: null,
    });
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_code, party_type, name, staff_role, is_active, created_at, updated_at)
         VALUES (?, ?, 'STF-A-000001', 'staff', 'Matching Staff', 'technician', 1, ?, ?)`,
      )
      .run(
        '33333333-0000-1000-8000-000000000001',
        TENANT_ID,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const results = await repo.searchCustomers({ query: 'Matching' });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Matching Customer');
  });

  it('getCustomerBalance reads through v_party_balance', async () => {
    const customer = await repo.createCustomer({
      partyCode: null,
      name: 'Balance Test Customer',
      shopName: null,
      phone: null,
      customerType: null,
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });

    // +250000 paisa = Rs 2,500.00, customer owes the shop this much —
    // CF-2's sign convention (+ve = party owes shop more).
    rawDb
      .prepare(
        `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, source_type, source_id, created_at)
         VALUES (?, ?, ?, ?, 'sale', 250000, 'sale', 'scratch-sale-id', ?)`,
      )
      .run(
        '44444444-0000-1000-8000-000000000001',
        TENANT_ID,
        customer.id,
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const customerBalance = await repo.getCustomerBalance(customer.id);
    expect(customerBalance.customerId).toBe(customer.id);
    expect(customerBalance.balancePaisa).toBe(250000);
  });
});
