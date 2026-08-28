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
import { KyselyItemRepository } from './item.repository.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselySaleRepository } from './sale.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';
const RETAIL_UNIT_PRICE_PAISA = 1500000; // Rs 15,000 / piece

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let saleRepo: KyselySaleRepository;
let itemRepo: KyselyItemRepository;
let partyRepo: KyselyPartyRepository;

let warehouseId: string;
let compressorItemId: string;
let retailCustomerId: string;
let creditLimitedCustomerId: string;
let retailPriceLevelId: string;

function insertOpeningStock(itemId: string, quantityMilli: number): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, source_type, source_id, reason, reversed_by_id, created_at, created_by, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'opening', ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)`,
    )
    .run(newId(), TENANT_ID, itemId, warehouseId, now, quantityMilli, now);
}

function stockMovementsFor(sourceId: string): Array<Record<string, unknown>> {
  return rawDb
    .prepare(`SELECT * FROM stock_movement WHERE source_id = ? ORDER BY created_at, id`)
    .all(sourceId) as Array<Record<string, unknown>>;
}

function partyLedgerFor(sourceId: string): Array<Record<string, unknown>> {
  return rawDb
    .prepare(`SELECT * FROM party_ledger WHERE source_id = ? ORDER BY created_at, id`)
    .all(sourceId) as Array<Record<string, unknown>>;
}

function stockOnHand(itemId: string): number {
  const row = rawDb
    .prepare(`SELECT qty_milli FROM v_stock_on_hand WHERE item_id = ? AND warehouse_id = ?`)
    .get(itemId, warehouseId) as { qty_milli: number } | undefined;
  return row?.qty_milli ?? 0;
}

function partyBalance(partyId: string): number {
  const row = rawDb
    .prepare(`SELECT balance_paisa FROM v_party_balance WHERE party_id = ?`)
    .get(partyId) as { balance_paisa: number } | undefined;
  return row?.balance_paisa ?? 0;
}

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-sale-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  saleRepo = new KyselySaleRepository(kysely, TENANT_ID, DEVICE_CODE);
  itemRepo = new KyselyItemRepository(kysely, TENANT_ID, DEVICE_CODE);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);

  const businessUnit = rawDb
    .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
    .get(TENANT_ID) as { id: string };
  const pieceUom = rawDb
    .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`)
    .get(TENANT_ID) as { id: string };
  const warehouse = rawDb
    .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
    .get(TENANT_ID) as { id: string };
  const retailLevel = rawDb
    .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'`)
    .get(TENANT_ID) as { id: string };

  warehouseId = warehouse.id;
  retailPriceLevelId = retailLevel.id;

  const compressor = await itemRepo.createItem({
    itemCode: null,
    nameEn: 'Compressor 1.5T',
    nameUr: null,
    businessUnitId: businessUnit.id,
    stockUomId: pieceUom.id,
    trackStock: true,
    retailPricePaisa: RETAIL_UNIT_PRICE_PAISA,
  });
  compressorItemId = compressor.id;
  // A real shop's items are purchased before they're ever sold — set
  // avg_cost directly (simulating a prior purchase) so unitCostMissing
  // is false by default in these fixtures. Rs 9,000/piece, below the
  // Rs 15,000 sale price.
  rawDb.prepare(`UPDATE item SET avg_cost = 900000 WHERE id = ?`).run(compressorItemId);
  insertOpeningStock(compressorItemId, 10000); // 10 pieces

  const retailCustomer = await partyRepo.createCustomer({
    partyCode: null,
    name: 'Naeem Fridge Repairs',
    shopName: null,
    phone: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: null, // unlimited
    notes: null,
  });
  retailCustomerId = retailCustomer.id;

  const creditLimitedCustomer = await partyRepo.createCustomer({
    partyCode: null,
    name: 'Swat Cold Storage',
    shopName: null,
    phone: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: 2000000, // Rs 20,000
    notes: null,
  });
  creditLimitedCustomerId = creditLimitedCustomer.id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselySaleRepository.createSale', () => {
  it('test 1 — cash sale, walk-in, decrements stock, zero party_ledger rows', async () => {
    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: 3000000,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 2000, unitPricePaisa: null }],
    });

    // line_total = 1,500,000 x 2000 / 1000 = 3,000,000 paisa
    // subtotal = total = 3,000,000, paid_amount = 3,000,000
    expect(result.totalAmountPaisa).toBe(3000000);
    expect(result.warnings.stockBelowZero).toBe(false);

    const movements = stockMovementsFor(result.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.['quantity']).toBe(-2000);

    // 10000 - 2000 = 8000 milli
    expect(stockOnHand(compressorItemId)).toBe(8000);

    expect(partyLedgerFor(result.id)).toHaveLength(0);
  });

  it('test 2 — credit sale, retail customer, positive party_ledger row', async () => {
    const result = await saleRepo.createSale({
      customerId: retailCustomerId,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'credit',
      paidAmountPaisa: 0,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    // line_total = 1,500,000 x 1000 / 1000 = 1,500,000 paisa
    // total = 1,500,000, paid_amount = 0
    expect(result.totalAmountPaisa).toBe(1500000);

    const ledgerRows = partyLedgerFor(result.id);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.['entry_type']).toBe('sale');
    expect(ledgerRows[0]?.['amount']).toBe(1500000);

    expect(partyBalance(retailCustomerId)).toBe(1500000);

    const movements = stockMovementsFor(result.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.['quantity']).toBe(-1000);
  });

  it('test 3 — credit limit exceeded: warning fires, sale still commits', async () => {
    // Pre-existing balance: customer already owes Rs 10,000
    rawDb
      .prepare(
        `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, source_type, source_id, created_at)
         VALUES (?, ?, ?, ?, 'sale', 1000000, 'sale', ?, ?)`,
      )
      .run(
        newId(),
        TENANT_ID,
        creditLimitedCustomerId,
        '2026-08-20',
        newId(),
        new Date().toISOString(),
      );

    const result = await saleRepo.createSale({
      customerId: creditLimitedCustomerId,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'credit',
      paidAmountPaisa: 0,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    // 1,000,000 (already owed) + 1,500,000 (this sale) = 2,500,000
    // > credit_limit 2,000,000 -> warning
    expect(result.totalAmountPaisa).toBe(1500000);
    expect(result.warnings.creditLimitExceeded).toBe(true);

    // The warning must not block the commit — the ledger row must exist.
    const ledgerRows = partyLedgerFor(result.id);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.['amount']).toBe(1500000);
  });

  it('test 4 — negative stock: warning fires, sale still commits', async () => {
    const businessUnit = rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string };
    const pieceUom = rawDb
      .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`)
      .get(TENANT_ID) as { id: string };
    const scarce = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Scarce Item',
      nameUr: null,
      businessUnitId: businessUnit.id,
      stockUomId: pieceUom.id,
      trackStock: true,
      retailPricePaisa: RETAIL_UNIT_PRICE_PAISA,
    });
    insertOpeningStock(scarce.id, 5000); // 5 pieces

    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA * 8,
      notes: null,
      lines: [{ itemId: scarce.id, quantityMilli: 8000, unitPricePaisa: null }],
    });

    // 5000 - 8000 = -3000 milli
    expect(result.warnings.stockBelowZero).toBe(true);

    const movements = stockMovementsFor(result.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.['quantity']).toBe(-8000);
    expect(stockOnHand(scarce.id)).toBe(-3000);
  });

  it('test 6 — business_unit_id on sale_line matches item.business_unit_id', async () => {
    const businessUnit = rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string };

    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    const line = rawDb
      .prepare(`SELECT business_unit_id FROM sale_line WHERE sale_id = ?`)
      .get(result.id) as { business_unit_id: string | null };
    expect(line.business_unit_id).toBe(businessUnit.id);
    expect(line.business_unit_id).not.toBeNull();
  });

  it('test 6a — retail customer with an explicit Retail price level gets the Retail price', async () => {
    const retailTierCustomer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Explicit Retail Tier Customer',
      shopName: null,
      phone: null,
      customerType: 'retail',
      priceLevelId: retailPriceLevelId,
      creditLimitPaisa: null,
      notes: null,
    });

    const result = await saleRepo.createSale({
      customerId: retailTierCustomer.id,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    const line = rawDb
      .prepare(`SELECT unit_price FROM sale_line WHERE sale_id = ?`)
      .get(result.id) as { unit_price: number };
    expect(line.unit_price).toBe(1500000);
  });

  it('test 6b — wholesale customer with a Wholesale item_price gets the Wholesale price, not Retail', async () => {
    const wholesaleLevelId = newId();
    rawDb
      .prepare(
        `INSERT INTO price_level (id, tenant_id, name, is_default, margin_bp, sort_order)
         VALUES (?, ?, 'Wholesale', 0, NULL, 1)`,
      )
      .run(wholesaleLevelId, TENANT_ID);
    rawDb
      .prepare(
        `INSERT INTO item_price (id, tenant_id, item_id, price_level_id, price, effective_from, created_at)
         VALUES (?, ?, ?, ?, 1400000, ?, ?)`,
      )
      .run(
        newId(),
        TENANT_ID,
        compressorItemId,
        wholesaleLevelId,
        '2026-08-01',
        new Date().toISOString(),
      );

    const wholesaleCustomer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Wholesale Tier Customer',
      shopName: null,
      phone: null,
      customerType: 'wholesale',
      priceLevelId: wholesaleLevelId,
      creditLimitPaisa: null,
      notes: null,
    });

    const result = await saleRepo.createSale({
      customerId: wholesaleCustomer.id,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: 1400000,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    const line = rawDb
      .prepare(`SELECT unit_price FROM sale_line WHERE sale_id = ?`)
      .get(result.id) as { unit_price: number };
    expect(line.unit_price).toBe(1400000);
    expect(line.unit_price).not.toBe(1500000);
  });

  it('test 6c — wholesale customer with NO Wholesale item_price falls back to Retail', async () => {
    const wholesaleLevelId = newId();
    rawDb
      .prepare(
        `INSERT INTO price_level (id, tenant_id, name, is_default, margin_bp, sort_order)
         VALUES (?, ?, 'Wholesale', 0, NULL, 1)`,
      )
      .run(wholesaleLevelId, TENANT_ID);
    // Deliberately NOT inserting an item_price row for this level.

    const wholesaleCustomer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Wholesale Tier, No Wholesale Price',
      shopName: null,
      phone: null,
      customerType: 'wholesale',
      priceLevelId: wholesaleLevelId,
      creditLimitPaisa: null,
      notes: null,
    });

    const result = await saleRepo.createSale({
      customerId: wholesaleCustomer.id,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    const line = rawDb
      .prepare(`SELECT unit_price FROM sale_line WHERE sale_id = ?`)
      .get(result.id) as { unit_price: number };
    expect(line.unit_price).toBe(1500000);
  });

  it('test 6d — walk-in (no customer, no price level) resolves to default Retail', async () => {
    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    const line = rawDb
      .prepare(`SELECT unit_price FROM sale_line WHERE sale_id = ?`)
      .get(result.id) as { unit_price: number };
    expect(line.unit_price).toBe(1500000);
  });

  it('createSale generates INV-NNNN doc_no', async () => {
    // First sale on a fresh DB: nextNumber=1, formatDisplayDocNumber('INV', 1) = 'INV-0001'
    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    expect(result.docNo).toBe('INV-0001');
  });
});

describe('KyselySaleRepository.cancelSale', () => {
  it('test 5 — cancelling a credit sale reverses stock and ledger, originals untouched, status=cancelled', async () => {
    const sale = await saleRepo.createSale({
      customerId: retailCustomerId,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'credit',
      paidAmountPaisa: 0,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 1000, unitPricePaisa: null }],
    });

    await saleRepo.cancelSale(sale.id);

    const saleRow = rawDb.prepare(`SELECT status FROM sale WHERE id = ?`).get(sale.id) as {
      status: string;
    };
    expect(saleRow.status).toBe('cancelled');

    // reversing stock_movement.quantity = +1000
    // reversing party_ledger.amount = -1,500,000
    // net stock: 10000 - 1000 + 1000 = 10000 (back to opening)
    // net balance: +1,500,000 - 1,500,000 = 0
    const movements = stockMovementsFor(sale.id);
    expect(movements).toHaveLength(2);
    const original = movements.find((m) => m['quantity'] === -1000);
    const reversal = movements.find((m) => m['quantity'] === 1000);
    expect(original).toBeDefined();
    expect(reversal).toBeDefined();
    expect(original?.['reversed_by_id']).toBeNull();
    expect(reversal?.['reversed_by_id']).toBeNull();
    expect(stockOnHand(compressorItemId)).toBe(10000);

    const ledgerRows = partyLedgerFor(sale.id);
    expect(ledgerRows).toHaveLength(2);
    const originalLedger = ledgerRows.find((r) => r['amount'] === 1500000);
    const reversalLedger = ledgerRows.find((r) => r['amount'] === -1500000);
    expect(originalLedger).toBeDefined();
    expect(reversalLedger).toBeDefined();
    expect(originalLedger?.['reversed_by_id']).toBeNull();
    expect(reversalLedger?.['reversed_by_id']).toBeNull();
    expect(partyBalance(retailCustomerId)).toBe(0);
  });
});

describe('KyselySaleRepository — alt unit conversion', () => {
  it('test 7 — sale with alt unit converts stock quantity', async () => {
    const kgUomId = (
      rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`).get(TENANT_ID) as {
        id: string;
      }
    ).id;
    const footUomId = (
      rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Foot'`).get(TENANT_ID) as {
        id: string;
      }
    ).id;
    const businessUnit = rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string };

    // 1 foot of this pipe = 0.305 kg -> altUomFactorMilli = 305
    const pipe = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Copper Pipe (alt unit)',
      nameUr: null,
      businessUnitId: businessUnit.id,
      stockUomId: kgUomId,
      trackStock: true,
      retailPricePaisa: 100,
      altUomId: footUomId,
      altUomFactorMilli: 305,
    });
    insertOpeningStock(pipe.id, 100000); // 100 kg

    // Sale line: 10000 milli-feet (10 feet), saleUomId=Foot, saleToStockFactor=305.
    // stock_qty_milli = Math.round((10000 x 305) / 1000)
    //                 = Math.round(3050000 / 1000)
    //                 = Math.round(3050) = 3050 milli-kg (3.05 kg)
    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: 1000,
      notes: null,
      lines: [
        {
          itemId: pipe.id,
          quantityMilli: 10000,
          unitPricePaisa: null,
          saleUomId: footUomId,
          saleToStockFactor: 305,
        },
      ],
    });

    const movements = stockMovementsFor(result.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.['quantity']).toBe(-3050);

    // 100000 - 3050 = 96950 milli-kg
    expect(stockOnHand(pipe.id)).toBe(96950);

    const line = rawDb
      .prepare(
        `SELECT quantity, sale_uom_id, sale_to_stock_factor FROM sale_line WHERE sale_id = ?`,
      )
      .get(result.id) as { quantity: number; sale_uom_id: string; sale_to_stock_factor: number };
    // sale_line.quantity stores the foot qty the customer bought, unchanged.
    expect(line.quantity).toBe(10000);
    expect(line.sale_uom_id).toBe(footUomId);
    expect(line.sale_to_stock_factor).toBe(305);
  });

  it('test 8 — sale without alt unit is unchanged (no regression)', async () => {
    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-26',
      paymentMode: 'cash',
      paidAmountPaisa: RETAIL_UNIT_PRICE_PAISA * 2,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityMilli: 2000, unitPricePaisa: null }],
    });

    const movements = stockMovementsFor(result.id);
    expect(movements).toHaveLength(1);
    // No conversion applied: stock_movement.quantity equals the input
    // quantityMilli directly.
    expect(movements[0]?.['quantity']).toBe(-2000);

    const line = rawDb
      .prepare(`SELECT sale_uom_id FROM sale_line WHERE sale_id = ?`)
      .get(result.id) as { sale_uom_id: string | null };
    expect(line.sale_uom_id).toBeNull();
  });
});
