import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import {
  GrnAlreadyCancelledError,
  MissingSupplierForCreditError,
  PurchaseOrderCancelledError,
} from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyPurchaseOrderRepository } from './purchase-order.repository.js';
import { KyselyGrnRepository } from './grn.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let poRepo: KyselyPurchaseOrderRepository;
let grnRepo: KyselyGrnRepository;
let supplierId: string;
let pieceUomId: string;
let kgUomId: string;
let cylinderUomId: string;
let compressorItemId: string;
let gasItemId: string;
let wholesalePriceLevelId: string;

function insertItem(
  id: string,
  nameEn: string,
  stockUomId: string,
  purchaseUomId: string | null,
  purchaseToStockFactor: number,
  lastPurchaseCostPaisa: number | null,
): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO item
         (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id,
          purchase_uom_id, purchase_to_stock_factor, last_purchase_cost, avg_cost,
          is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, (SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'),
               ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      TENANT_ID,
      id,
      nameEn,
      TENANT_ID,
      stockUomId,
      purchaseUomId,
      purchaseToStockFactor,
      lastPurchaseCostPaisa,
      lastPurchaseCostPaisa,
      now,
      now,
    );
}

function insertRetailPrice(itemId: string, pricePaisa: number): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO item_price (id, tenant_id, item_id, price_level_id, price, effective_from, created_at)
       VALUES (?, ?, ?, (SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'), ?, ?, ?)`,
    )
    .run(newId(), TENANT_ID, itemId, TENANT_ID, pricePaisa, now, now);
}

function purchaseCostHistoryRows(itemId: string): Array<Record<string, unknown>> {
  return rawDb
    .prepare(`SELECT * FROM item_price_history WHERE item_id = ? AND price_type = 'purchase_cost'`)
    .all(itemId) as Array<Record<string, unknown>>;
}

function retailHistoryRows(itemId: string): Array<Record<string, unknown>> {
  return rawDb
    .prepare(`SELECT * FROM item_price_history WHERE item_id = ? AND price_type = 'retail'`)
    .all(itemId) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-grn-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  // bootstrap.ts only seeds the 'Retail' price level (DEFAULT_PRICE_LEVEL_NAME)
  // — confirmed by reading bootstrap.ts before writing this fixture, per the
  // pre-start verification. 'Wholesale' must be created explicitly here.
  wholesalePriceLevelId = newId();
  rawDb
    .prepare(
      `INSERT INTO price_level (id, tenant_id, name, is_default, sort_order) VALUES (?, ?, 'Wholesale', 0, 1)`,
    )
    .run(wholesalePriceLevelId, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  poRepo = new KyselyPurchaseOrderRepository(kysely, TENANT_ID, DEVICE_CODE);
  grnRepo = new KyselyGrnRepository(kysely, TENANT_ID, DEVICE_CODE);

  pieceUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  kgUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  cylinderUomId = (
    rawDb
      .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Cylinder'`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;

  const now = new Date().toISOString();
  supplierId = '10000000-0000-1000-8000-000000000001';
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, phone, is_active, created_at, updated_at)
       VALUES (?, ?, 'SUP-A-000001', 'supplier', 'Test Gas & Compressor Supplier', '0300', 1, ?, ?)`,
    )
    .run(supplierId, TENANT_ID, now, now);

  compressorItemId = '20000000-0000-1000-8000-000000000001';
  insertItem(compressorItemId, 'Compressor 1.5 Ton', pieceUomId, pieceUomId, 1000, null);

  // Same fixture as purchase.repository.test.ts — 13.6 kg/cylinder, same
  // item, same numbers, same verification standard (per the Phase 9 brief).
  gasItemId = '20000000-0000-1000-8000-000000000002';
  insertItem(gasItemId, 'Gas R-410A (13.6kg cylinder)', kgUomId, cylinderUomId, 13_600, null);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyGrnRepository.create', () => {
  it('1. cash, full quantity, price same as existing: stock posts, no purchase_cost history, no party_ledger', async () => {
    // Item already bought once at Rs 5,000/piece (500,000 paisa) and already
    // listed at retail Rs 7,500/piece (750,000 paisa).
    rawDb
      .prepare(`UPDATE item SET last_purchase_cost = 500000, avg_cost = 500000 WHERE id = ?`)
      .run(compressorItemId);
    insertRetailPrice(compressorItemId, 750_000);

    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 3000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    const result = await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: null,
      supplierBillRef: 'BILL-1001',
      grnDate: '2026-09-13',
      paymentMode: 'cash',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          // Same price as before: unit_cost 500,000 == item.last_purchase_cost.
          // factor = 1000 (1:1), so costPerStockUnitPaisa = 500,000 unchanged.
          quantityReceivedMilli: 3000,
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000, // same as the existing retail item_price row
          wholesalePricePaisa: null,
        },
      ],
    });

    const movement = rawDb
      .prepare(`SELECT * FROM stock_movement WHERE source_type = 'grn' AND source_id = ?`)
      .get(result.id) as Record<string, unknown>;
    expect(movement['quantity']).toBe(3000);
    expect(movement['unit_cost']).toBe(500_000);
    expect(movement['movement_type']).toBe('purchase');

    const item = rawDb
      .prepare(`SELECT last_purchase_cost, avg_cost FROM item WHERE id = ?`)
      .get(compressorItemId) as { last_purchase_cost: number; avg_cost: number };
    expect(item.last_purchase_cost).toBe(500_000);
    expect(item.avg_cost).toBe(500_000);

    // Condition A — purchase cost: same price in, zero history rows.
    expect(purchaseCostHistoryRows(compressorItemId)).toHaveLength(0);
    // Condition B — retail: same price in, zero history rows. Independent
    // query, independent assertion — not conflated with condition A.
    expect(retailHistoryRows(compressorItemId)).toHaveLength(0);

    const poLine = rawDb
      .prepare(`SELECT quantity_received_milli FROM purchase_order_line WHERE id = ?`)
      .get(poLineId) as { quantity_received_milli: number };
    expect(poLine.quantity_received_milli).toBe(3000);

    const poRow = rawDb.prepare(`SELECT status FROM purchase_order WHERE id = ?`).get(po.id) as {
      status: string;
    };
    expect(poRow.status).toBe('fully_received');

    const ledgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE source_id = ?`)
      .all(result.id);
    expect(ledgerRows).toHaveLength(0);
  });

  it('2. credit, full quantity, new purchase cost AND new retail price: history rows, ledger amount hand-verified', async () => {
    // Old price Rs 4,500/piece (450,000 paisa); old retail Rs 7,000/piece (700,000 paisa).
    rawDb
      .prepare(`UPDATE item SET last_purchase_cost = 450000, avg_cost = 450000 WHERE id = ?`)
      .run(compressorItemId);
    insertRetailPrice(compressorItemId, 700_000);

    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 3000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    // New bill price Rs 5,000/piece (500,000 paisa), new retail Rs 7,500 (750,000 paisa).
    // 3 pieces x 500,000 paisa = 1,500,000 paisa total owed to the supplier.
    // party_ledger.amount = -1,500,000 (shop's balance toward the supplier goes down).
    const result = await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: null, // inherited from the PO
      supplierBillRef: 'BILL-1002',
      grnDate: '2026-09-13',
      paymentMode: 'credit',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          quantityReceivedMilli: 3000,
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    const purchaseCostHistory = purchaseCostHistoryRows(compressorItemId);
    expect(purchaseCostHistory).toHaveLength(1);
    expect(purchaseCostHistory[0]?.['old_value_paisa']).toBe(450_000);
    expect(purchaseCostHistory[0]?.['new_value_paisa']).toBe(500_000);

    const retailHistory = retailHistoryRows(compressorItemId);
    expect(retailHistory).toHaveLength(1);
    expect(retailHistory[0]?.['old_value_paisa']).toBe(700_000);
    expect(retailHistory[0]?.['new_value_paisa']).toBe(750_000);

    const item = rawDb
      .prepare(`SELECT last_purchase_cost FROM item WHERE id = ?`)
      .get(compressorItemId) as { last_purchase_cost: number };
    expect(item.last_purchase_cost).toBe(500_000);

    const ledgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE source_type = 'grn' AND source_id = ?`)
      .all(result.id) as Array<Record<string, unknown>>;
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.['party_id']).toBe(supplierId);
    expect(ledgerRows[0]?.['entry_type']).toBe('purchase');
    // Hand calc: 3 x 500,000 = 1,500,000 paisa; ledger is negative (we owe more).
    expect(ledgerRows[0]?.['amount']).toBe(-1_500_000);
    expect(ledgerRows[0]?.['bill_reference']).toBe('BILL-1002');

    const poRow = rawDb.prepare(`SELECT status FROM purchase_order WHERE id = ?`).get(po.id) as {
      status: string;
    };
    expect(poRow.status).toBe('fully_received');
  });

  it('3. partial GRN: receive 3 of 5 ordered -> partially_received', async () => {
    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 5000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    const result = await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: supplierId,
      supplierBillRef: null,
      grnDate: '2026-09-13',
      paymentMode: 'cash',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          quantityReceivedMilli: 3000,
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    const poLine = rawDb
      .prepare(`SELECT quantity_received_milli FROM purchase_order_line WHERE id = ?`)
      .get(poLineId) as { quantity_received_milli: number };
    expect(poLine.quantity_received_milli).toBe(3000);

    const poRow = rawDb.prepare(`SELECT status FROM purchase_order WHERE id = ?`).get(po.id) as {
      status: string;
    };
    expect(poRow.status).toBe('partially_received');

    const movement = rawDb
      .prepare(`SELECT quantity FROM stock_movement WHERE source_type = 'grn' AND source_id = ?`)
      .get(result.id) as { quantity: number };
    expect(movement.quantity).toBe(3000);
  });

  it('4. second GRN against the same PO completes it -> fully_received', async () => {
    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 5000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: supplierId,
      supplierBillRef: null,
      grnDate: '2026-09-13',
      paymentMode: 'cash',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          quantityReceivedMilli: 3000,
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: supplierId,
      supplierBillRef: null,
      grnDate: '2026-09-14',
      paymentMode: 'cash',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          quantityReceivedMilli: 2000, // the remaining 2 of 5
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    const poLine = rawDb
      .prepare(`SELECT quantity_received_milli FROM purchase_order_line WHERE id = ?`)
      .get(poLineId) as { quantity_received_milli: number };
    expect(poLine.quantity_received_milli).toBe(5000);

    const poRow = rawDb.prepare(`SELECT status FROM purchase_order WHERE id = ?`).get(po.id) as {
      status: string;
    };
    expect(poRow.status).toBe('fully_received');
  });

  it('5. unplanned line (purchase_order_line_id null) posts stock and does not disturb the planned line status', async () => {
    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 1000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    const result = await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: supplierId,
      supplierBillRef: null,
      grnDate: '2026-09-13',
      paymentMode: 'cash',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          quantityReceivedMilli: 1000,
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000,
          wholesalePricePaisa: null,
        },
        {
          // Unplanned: the supplier threw in a gas cylinder not on the PO.
          purchaseOrderLineId: null,
          itemId: gasItemId,
          quantityReceivedMilli: 13_600,
          unitCostPaisa: 3_500_000,
          sellingPricePaisa: 4_000_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    const grnLineRows = rawDb
      .prepare(`SELECT * FROM grn_line WHERE grn_id = ? ORDER BY item_id`)
      .all(result.id) as Array<Record<string, unknown>>;
    expect(grnLineRows).toHaveLength(2);
    const unplannedLine = grnLineRows.find((l) => l['item_id'] === gasItemId);
    expect(unplannedLine?.['purchase_order_line_id']).toBeNull();

    const gasMovement = rawDb
      .prepare(
        `SELECT quantity FROM stock_movement WHERE source_type = 'grn' AND source_id = ? AND item_id = ?`,
      )
      .get(result.id, gasItemId) as { quantity: number };
    expect(gasMovement.quantity).toBe(13_600);

    // No extra purchase_order_line row was created for the unplanned item.
    const poLineCount = (
      rawDb
        .prepare(`SELECT COUNT(*) as c FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { c: number }
    ).c;
    expect(poLineCount).toBe(1);

    const poRow = rawDb.prepare(`SELECT status FROM purchase_order WHERE id = ?`).get(po.id) as {
      status: string;
    };
    // The only planned line (compressor, 1000/1000) is fully received —
    // the unplanned gas line has no bearing on this computation at all.
    expect(poRow.status).toBe('fully_received');
  });

  it('6. credit GRN with no resolvable supplier (neither GRN nor PO) throws MissingSupplierForCreditError', async () => {
    const po = await poRepo.create({
      supplierPartyId: null,
      supplierNote: 'Roadside vendor, no account',
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 1000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    await expect(
      grnRepo.create({
        purchaseOrderId: po.id,
        supplierPartyId: null,
        supplierBillRef: null,
        grnDate: '2026-09-13',
        paymentMode: 'credit',
        notes: null,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            itemId: compressorItemId,
            quantityReceivedMilli: 1000,
            unitCostPaisa: 500_000,
            sellingPricePaisa: 750_000,
            wholesalePricePaisa: null,
          },
        ],
      }),
    ).rejects.toThrow(MissingSupplierForCreditError);

    // Nothing partially applied: no stock movement, PO line untouched.
    const movementCount = (
      rawDb
        .prepare(`SELECT COUNT(*) as c FROM stock_movement WHERE item_id = ?`)
        .get(compressorItemId) as {
        c: number;
      }
    ).c;
    expect(movementCount).toBe(0);
  });

  it('7. GRN against a cancelled PO throws PurchaseOrderCancelledError', async () => {
    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 1000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;
    await poRepo.cancel(po.id);

    await expect(
      grnRepo.create({
        purchaseOrderId: po.id,
        supplierPartyId: supplierId,
        supplierBillRef: null,
        grnDate: '2026-09-13',
        paymentMode: 'cash',
        notes: null,
        lines: [
          {
            purchaseOrderLineId: poLineId,
            itemId: compressorItemId,
            quantityReceivedMilli: 1000,
            unitCostPaisa: 500_000,
            sellingPricePaisa: 750_000,
            wholesalePricePaisa: null,
          },
        ],
      }),
    ).rejects.toThrow(PurchaseOrderCancelledError);
  });

  it('10. UoM-conversion item (cylinder -> kg): stock quantity/cost hand-verified from Phase 2', async () => {
    // Same fixture, same hand calculation as
    // purchase.repository.test.ts's cash-purchase test:
    //   unit_cost_paisa = 3,500,000 (Rs 35,000 per cylinder, the bill price)
    //   item.purchaseToStockFactor = 13,600 (13.6 kg/cylinder)
    //   costPerStockUnitPaisa = round(3,500,000 * 1000 / 13,600) = 257,353 (Rs 2,573.53/kg)
    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      // 1 cylinder ordered, in purchase UoM milli-units.
      lines: [{ itemId: gasItemId, quantityOrderedMilli: 1000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    const result = await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: supplierId,
      supplierBillRef: 'BILL-GAS-1',
      grnDate: '2026-09-13',
      paymentMode: 'cash',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: gasItemId,
          // Actual measured yield, in stock UoM (kg) milli-units.
          quantityReceivedMilli: 13_600,
          unitCostPaisa: 3_500_000,
          sellingPricePaisa: 4_000_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    const movement = rawDb
      .prepare(
        `SELECT quantity, unit_cost FROM stock_movement WHERE source_type = 'grn' AND source_id = ?`,
      )
      .get(result.id) as { quantity: number; unit_cost: number };
    expect(movement.quantity).toBe(13_600);
    expect(movement.unit_cost).toBe(257_353);

    const item = rawDb
      .prepare(`SELECT last_purchase_cost, avg_cost FROM item WHERE id = ?`)
      .get(gasItemId) as { last_purchase_cost: number; avg_cost: number };
    // item.last_purchase_cost/avg_cost are always per-stock-unit — the
    // converted value, never the raw per-cylinder bill price.
    expect(item.last_purchase_cost).toBe(257_353);
    expect(item.avg_cost).toBe(257_353);
  });
});

describe('KyselyGrnRepository.cancel', () => {
  it('8. cancelling a confirmed credit GRN reverses stock and ledger, decrements the PO line, reverts PO status', async () => {
    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 3000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    const result = await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: supplierId,
      supplierBillRef: 'BILL-1003',
      grnDate: '2026-09-13',
      paymentMode: 'credit',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          quantityReceivedMilli: 3000,
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    // Confirm the pre-cancel state before acting, so the reversal assertions
    // below are provably a reversal and not just an absence of data.
    const poRowBefore = rawDb
      .prepare(`SELECT status FROM purchase_order WHERE id = ?`)
      .get(po.id) as { status: string };
    expect(poRowBefore.status).toBe('fully_received');

    await grnRepo.cancel(result.id);

    const movements = rawDb
      .prepare(`SELECT * FROM stock_movement WHERE source_id = ? ORDER BY created_at`)
      .all(result.id) as Array<Record<string, unknown>>;
    // Original 'purchase' movement (+3000) untouched, plus a new reversing
    // 'purchase_cancellation' row (-3000) under source_type='grn_cancellation'.
    const reversal = rawDb
      .prepare(
        `SELECT * FROM stock_movement WHERE source_type = 'grn_cancellation' AND source_id = ?`,
      )
      .get(result.id) as Record<string, unknown>;
    expect(reversal['quantity']).toBe(-3000);
    expect(reversal['unit_cost']).toBe(500_000);
    expect(reversal['movement_type']).toBe('purchase_cancellation');
    expect(movements.filter((m) => m['source_type'] === 'grn')).toHaveLength(1);

    const ledgerReversal = rawDb
      .prepare(
        `SELECT * FROM party_ledger WHERE source_type = 'grn_cancellation' AND source_id = ?`,
      )
      .get(result.id) as Record<string, unknown>;
    expect(ledgerReversal['amount']).toBe(1_500_000); // positive: cancels the -1,500,000 original
    expect(ledgerReversal['entry_type']).toBe('purchase_return');

    const poLine = rawDb
      .prepare(`SELECT quantity_received_milli FROM purchase_order_line WHERE id = ?`)
      .get(poLineId) as { quantity_received_milli: number };
    expect(poLine.quantity_received_milli).toBe(0);

    const poRowAfter = rawDb
      .prepare(`SELECT status FROM purchase_order WHERE id = ?`)
      .get(po.id) as { status: string };
    expect(poRowAfter.status).toBe('sent');

    const grnRow = rawDb.prepare(`SELECT status FROM grn WHERE id = ?`).get(result.id) as {
      status: string;
    };
    expect(grnRow.status).toBe('cancelled');

    // item_price_history rows are never removed by a cancellation.
    expect(purchaseCostHistoryRows(compressorItemId).length).toBeGreaterThan(0);
  });

  it('9. cancelling an already-cancelled GRN throws GrnAlreadyCancelledError', async () => {
    const po = await poRepo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 1000, notes: null }],
    });
    const poLineId = (
      rawDb
        .prepare(`SELECT id FROM purchase_order_line WHERE purchase_order_id = ?`)
        .get(po.id) as { id: string }
    ).id;

    const result = await grnRepo.create({
      purchaseOrderId: po.id,
      supplierPartyId: supplierId,
      supplierBillRef: null,
      grnDate: '2026-09-13',
      paymentMode: 'cash',
      notes: null,
      lines: [
        {
          purchaseOrderLineId: poLineId,
          itemId: compressorItemId,
          quantityReceivedMilli: 1000,
          unitCostPaisa: 500_000,
          sellingPricePaisa: 750_000,
          wholesalePricePaisa: null,
        },
      ],
    });

    await grnRepo.cancel(result.id);

    await expect(grnRepo.cancel(result.id)).rejects.toThrow(GrnAlreadyCancelledError);
  });
});
