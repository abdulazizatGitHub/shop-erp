import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase, migrate, seed, createKyselyDb, KyselyItemRepository } from '@shop/db';
import { runCreateSale, type SaleHandlerDeps } from './sale.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';
const RETAIL_UNIT_PRICE_PAISA = 1500000; // Rs 15,000 / piece

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let deps: SaleHandlerDeps;
let businessUnitId: string;
let pieceUomId: string;
let warehouseId: string;

// Opens and closes its own connection every call — the module-scoped
// rawDb is deliberately closed at the end of beforeEach (each test opens
// its own short-lived connection to set up its item, matching
// runCreateSale's own open/close-per-call contract), so this must never
// depend on that variable still being open.
function insertOpeningStock(itemId: string, quantityMilli: number): void {
  const now = new Date().toISOString();
  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, source_type, source_id, reason, reversed_by_id, created_at, created_by, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'opening', ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)`,
  ).run(newId(), TENANT_ID, itemId, warehouseId, now, quantityMilli, now);
  db.close();
}

function saleCount(): number {
  const db = openDatabase(dbPath);
  const row = db.prepare('SELECT COUNT(*) as n FROM sale').get() as { n: number };
  db.close();
  return row.n;
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-sale-handler-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  deps = { dbPath, tenantId: TENANT_ID, deviceCode: DEVICE_CODE };

  businessUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  pieceUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  warehouseId = (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as { id: string }
  ).id;
  rawDb.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * P17-1 review fix (handler-level test, requested item 4). Calls
 * `runCreateSale` directly — the plain function `registerSaleHandlers`
 * delegates to, same precedent as `customer-balance-import.handler.test.ts`'s
 * `runCustomerBalanceImport`. No electron mocking needed. Proves the
 * negative-stock cases RESOLVE (never reject) with a discriminated
 * NegativeStockOutcome — this is the actual IPC-boundary-safe contract,
 * not the thrown-error one the first draft of P17-1 assumed.
 */
describe('runCreateSale — negativeStockPolicy at the handler layer (P17-1 review)', () => {
  it("warn + acknowledgedNegativeStock OMITTED: RESOLVES (does not reject) with { negativeStock: 'confirmationRequired', items }, zero rows inserted", async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const scarce = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Handler Test Scarce Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: RETAIL_UNIT_PRICE_PAISA,
    });
    db.close();
    insertOpeningStock(scarce.id, 5000); // 5 pieces

    const saleCountBefore = saleCount();

    const outcome = await runCreateSale(deps, {
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA * 8,
      notes: null,
      lines: [{ itemId: scarce.id, quantityMilli: 8000, unitPricePaisa: null }],
      discountPaisa: 0,
      acknowledgedNegativeStock: false,
    });

    // The discriminant itself, plus a structural check that this is a
    // real resolved value, not a caught rejection re-shaped — the test
    // never wraps the call in try/catch at all.
    expect('negativeStock' in outcome).toBe(true);
    if (!('negativeStock' in outcome)) throw new Error('expected a NegativeStockOutcome');
    expect(outcome.negativeStock).toBe('confirmationRequired');
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]?.itemId).toBe(scarce.id);
    expect(outcome.items[0]?.onHandMilli).toBe(5000);
    expect(outcome.items[0]?.requestedMilli).toBe(8000);

    const saleCountAfter = saleCount();
    expect(saleCountAfter).toBe(saleCountBefore); // zero rows inserted
  });

  it("block + acknowledgedNegativeStock=true: RESOLVES with { negativeStock: 'blocked' } — the flag never bypasses it", async () => {
    rawDb = openDatabase(dbPath);
    rawDb
      .prepare(
        `INSERT INTO setting (tenant_id, key, value, updated_at) VALUES (?, 'negativeStockPolicy', 'block', ?)`,
      )
      .run(TENANT_ID, new Date().toISOString());
    const itemRepo = new KyselyItemRepository(createKyselyDb(rawDb), TENANT_ID, DEVICE_CODE);
    const scarce = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Handler Test Block Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: RETAIL_UNIT_PRICE_PAISA,
    });
    rawDb.close();
    insertOpeningStock(scarce.id, 5000);

    const outcome = await runCreateSale(deps, {
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA * 8,
      notes: null,
      lines: [{ itemId: scarce.id, quantityMilli: 8000, unitPricePaisa: null }],
      discountPaisa: 0,
      acknowledgedNegativeStock: true,
    });

    expect('negativeStock' in outcome).toBe(true);
    if (!('negativeStock' in outcome)) throw new Error('expected a NegativeStockOutcome');
    expect(outcome.negativeStock).toBe('blocked');
  });

  it('a normal in-stock sale resolves with the real CreateSaleAndPrintResult shape, not a NegativeStockOutcome', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const plenty = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Handler Test In-Stock Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: RETAIL_UNIT_PRICE_PAISA,
    });
    db.close();
    insertOpeningStock(plenty.id, 10000); // 10 pieces

    const outcome = await runCreateSale(deps, {
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA * 2,
      notes: null,
      lines: [{ itemId: plenty.id, quantityMilli: 2000, unitPricePaisa: null }],
      discountPaisa: 0,
      acknowledgedNegativeStock: false,
    });

    expect('negativeStock' in outcome).toBe(false);
    if ('negativeStock' in outcome) throw new Error('did not expect a NegativeStockOutcome');
    expect(outcome.totalAmountPaisa).toBe(RETAIL_UNIT_PRICE_PAISA * 2);
    expect(outcome.warnings.stockBelowZero).toBe(false);
  });
});
