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

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyItemRepository;
let businessUnitId: string;
let stockUomId: string;
let warehouseId: string;
let priceLevelId: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-item-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyItemRepository(kysely, TENANT_ID, DEVICE_CODE);

  businessUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;
  stockUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  warehouseId = (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as { id: string }
  ).id;
  priceLevelId = (
    rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as { id: string }
  ).id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

function insertStockMovement(itemId: string, quantityMilli: number, warehouse = warehouseId): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, source_type, source_id, reason, reversed_by_id, created_at, created_by, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'opening', ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)`,
    )
    .run(newId(), TENANT_ID, itemId, warehouse, now, quantityMilli, now);
}

/** Minimal confirmed sale + one sale_line, for topSellingItems fixtures — not a full createSale round-trip (no stock/ledger side effects needed for this query). */
function insertConfirmedSaleLine(itemId: string, quantityMilli: number): void {
  const now = new Date().toISOString();
  const saleId = newId();
  rawDb
    .prepare(
      `INSERT INTO sale (id, tenant_id, doc_no, customer_id, warehouse_id, price_level_id, sale_date, subtotal, total_amount, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 0, 0, 'confirmed', ?, ?)`,
    )
    .run(saleId, TENANT_ID, `TEST-${saleId}`, warehouseId, priceLevelId, now, now, now);
  rawDb
    .prepare(
      `INSERT INTO sale_line (id, tenant_id, sale_id, line_no, item_id, quantity, unit_price, line_total)
       VALUES (?, ?, ?, 1, ?, ?, 0, 0)`,
    )
    .run(newId(), TENANT_ID, saleId, itemId, quantityMilli);
}

function insertCancelledSaleLine(itemId: string, quantityMilli: number): void {
  const now = new Date().toISOString();
  const saleId = newId();
  rawDb
    .prepare(
      `INSERT INTO sale (id, tenant_id, doc_no, customer_id, warehouse_id, price_level_id, sale_date, subtotal, total_amount, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 0, 0, 'cancelled', ?, ?)`,
    )
    .run(saleId, TENANT_ID, `TEST-CANCELLED-${saleId}`, warehouseId, priceLevelId, now, now, now);
  rawDb
    .prepare(
      `INSERT INTO sale_line (id, tenant_id, sale_id, line_no, item_id, quantity, unit_price, line_total)
       VALUES (?, ?, ?, 1, ?, ?, 0, 0)`,
    )
    .run(newId(), TENANT_ID, saleId, itemId, quantityMilli);
}

describe('KyselyItemRepository.createItem', () => {
  it('auto-generates an item code when none is given, format ITM-A-000001', async () => {
    const result = await repo.createItem({
      itemCode: null,
      nameEn: 'Test Compressor',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 500000,
    });

    expect(result.itemCode).toBe('ITM-A-000001');

    const row = rawDb.prepare(`SELECT * FROM item WHERE id = ?`).get(result.id) as Record<
      string,
      unknown
    >;
    expect(row['name_en']).toBe('Test Compressor');
    expect(row['business_unit_id']).toBe(businessUnitId);
    expect(row['stock_uom_id']).toBe(stockUomId);
    expect(row['track_stock']).toBe(1);

    // 500000 paisa = Rs 5,000.00 — hand check
    const priceRow = rawDb
      .prepare(`SELECT price FROM item_price WHERE item_id = ?`)
      .get(result.id) as { price: number };
    expect(priceRow.price).toBe(500000);
  });

  it('increments the sequence on the second auto-generated code', async () => {
    const first = await repo.createItem({
      itemCode: null,
      nameEn: 'Item One',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    const second = await repo.createItem({
      itemCode: null,
      nameEn: 'Item Two',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 200,
    });

    expect(first.itemCode).toBe('ITM-A-000001');
    expect(second.itemCode).toBe('ITM-A-000002');
  });

  it('respects an explicit item code and does not touch the sequence', async () => {
    const result = await repo.createItem({
      itemCode: 'HAND-ENTERED-001',
      nameEn: 'Manually Coded Item',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });

    expect(result.itemCode).toBe('HAND-ENTERED-001');

    const next = await repo.createItem({
      itemCode: null,
      nameEn: 'Auto After Manual',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    // sequence must still start at 1 — explicit codes don't consume it
    expect(next.itemCode).toBe('ITM-A-000001');
  });

  it('rejects a duplicate item code via the UNIQUE constraint', async () => {
    await repo.createItem({
      itemCode: 'DUP-001',
      nameEn: 'First',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });

    await expect(
      repo.createItem({
        itemCode: 'DUP-001',
        nameEn: 'Second',
        nameUr: null,
        businessUnitId,
        stockUomId,
        trackStock: true,
        retailPricePaisa: 100,
      }),
    ).rejects.toThrow();
  });
});

describe('KyselyItemRepository.getItemById / searchItems', () => {
  it('round-trips a created item through getItemById', async () => {
    const created = await repo.createItem({
      itemCode: null,
      nameEn: 'Round Trip Item',
      nameUr: 'اردو نام',
      businessUnitId,
      stockUomId,
      trackStock: false,
      retailPricePaisa: 12345,
    });

    const fetched = await repo.getItemById(created.id);
    expect(fetched).toEqual({
      id: created.id,
      itemCode: created.itemCode,
      nameEn: 'Round Trip Item',
      nameUr: 'اردو نام',
      businessUnitId,
      stockUomId,
      retailPricePaisa: 12345,
      trackStock: false,
      altUomId: null,
      altUomFactorMilli: null,
      stockOnHandMilli: null,
    });
  });

  it('returns null for a missing id', async () => {
    const fetched = await repo.getItemById('00000000-0000-0000-0000-000000000099');
    expect(fetched).toBeNull();
  });

  it('finds items by partial name match', async () => {
    await repo.createItem({
      itemCode: null,
      nameEn: 'Copper Pipe 10ft',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    await repo.createItem({
      itemCode: null,
      nameEn: 'Gas R-134a',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });

    const results = await repo.searchItems({ query: 'Copper', categoryId: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.nameEn).toBe('Copper Pipe 10ft');
  });

  it('filters by category (P1-3)', async () => {
    // No UI sets category_id yet (P1-1 cut it; P1-2 import will) — set it
    // directly to prove the filter itself is correct, independent of that.
    const categoryId = 'aaaaaaaa-0000-0000-0000-000000000001';
    rawDbInsertCategory(categoryId, 'Piping');

    const piped = await repo.createItem({
      itemCode: null,
      nameEn: 'Copper Pipe 10ft',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    await repo.createItem({
      itemCode: null,
      nameEn: 'Gas R-134a',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    rawDb.prepare(`UPDATE item SET category_id = ? WHERE id = ?`).run(categoryId, piped.id);

    const results = await repo.searchItems({ query: '', categoryId });
    expect(results).toHaveLength(1);
    expect(results[0]?.nameEn).toBe('Copper Pipe 10ft');
  });
});

function rawDbInsertCategory(id: string, name: string): void {
  rawDb
    .prepare(`INSERT INTO category (id, tenant_id, name, sort_order) VALUES (?, ?, ?, 0)`)
    .run(id, TENANT_ID, name);
}

describe('KyselyItemRepository — alt unit', () => {
  it('item created with alt unit persists both columns', async () => {
    const footUomId = (
      rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Foot'`).get(TENANT_ID) as {
        id: string;
      }
    ).id;

    // altUomFactor input = 0.305 (kg per foot, ADR-0013's stored direction).
    // factorMilli = Math.round(0.305 x 1000) = 305. That conversion happens
    // at the contract/IPC layer, not here — the repository receives 305
    // directly. This test passes 305 to confirm round-trip storage only.
    const result = await repo.createItem({
      itemCode: null,
      nameEn: 'Copper Pipe (alt unit)',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
      altUomId: footUomId,
      altUomFactorMilli: 305,
    });

    const row = rawDb.prepare(`SELECT * FROM item WHERE id = ?`).get(result.id) as Record<
      string,
      unknown
    >;
    expect(row['alt_uom_id']).toBe(footUomId);
    expect(row['alt_uom_factor_milli']).toBe(305);
  });

  it('item created without alt unit has NULL columns', async () => {
    const result = await repo.createItem({
      itemCode: null,
      nameEn: 'Item Without Alt Unit',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });

    const row = rawDb.prepare(`SELECT * FROM item WHERE id = ?`).get(result.id) as Record<
      string,
      unknown
    >;
    expect(row['alt_uom_id']).toBeNull();
    expect(row['alt_uom_factor_milli']).toBeNull();
  });
});

describe('KyselyItemRepository.searchItems — stockOnHandMilli (E-1)', () => {
  it('sums stock_movement rows across warehouses for a stock-tracked item', async () => {
    const item = await repo.createItem({
      itemCode: null,
      nameEn: 'Tracked Compressor',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    // Two movements, possibly different warehouses in a real shop — here
    // both in the default one is enough to prove the SUM, since the
    // duplication risk this subquery avoids is about JOIN shape, not
    // warehouse count. 3000 + 2000 = 5000 milli, hand-calculated.
    insertStockMovement(item.id, 3000);
    insertStockMovement(item.id, 2000);

    const results = await repo.searchItems({ query: 'Tracked Compressor', categoryId: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.stockOnHandMilli).toBe(5000);
  });

  it('returns null, not 0, for an item with zero stock_movement rows', async () => {
    await repo.createItem({
      itemCode: null,
      nameEn: 'Never Moved Item',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });

    const results = await repo.searchItems({ query: 'Never Moved Item', categoryId: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.stockOnHandMilli).toBeNull();
  });

  it('returns null for a non-stock-tracked item even if movements exist', async () => {
    const item = await repo.createItem({
      itemCode: null,
      nameEn: 'Service Line Item',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: false,
      retailPricePaisa: 100,
    });
    // Shouldn't happen in practice for a non-stock-tracked item, but proves
    // the trackStock gate, not just the subquery's own NULL behavior.
    insertStockMovement(item.id, 1000);

    const results = await repo.searchItems({ query: 'Service Line Item', categoryId: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.stockOnHandMilli).toBeNull();
  });
});

describe('KyselyItemRepository.topSellingItems (E-2/E-3)', () => {
  it('orders items by total confirmed-sale quantity, most-sold first', async () => {
    const itemA = await repo.createItem({
      itemCode: null,
      nameEn: 'Item A',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    const itemB = await repo.createItem({
      itemCode: null,
      nameEn: 'Item B',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    const itemC = await repo.createItem({
      itemCode: null,
      nameEn: 'Item C',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });

    // A sold 5 times, B sold 3 times, C sold 1 time — 1000 milli/line.
    // Hand-calculated totals: A = 5000, B = 3000, C = 1000.
    for (let i = 0; i < 5; i++) insertConfirmedSaleLine(itemA.id, 1000);
    for (let i = 0; i < 3; i++) insertConfirmedSaleLine(itemB.id, 1000);
    insertConfirmedSaleLine(itemC.id, 1000);

    const results = await repo.topSellingItems(12);
    expect(results.map((r) => r.id)).toEqual([itemA.id, itemB.id, itemC.id]);

    const byId = new Map(results.map((r) => [r.id, r]));
    // total_sold_milli isn't returned on ItemRecord itself (it's a ranking
    // input, not a display field per E-2's spec) — the order assertion
    // above already proves the SUM; this re-derives the same numbers from
    // the raw table directly as an independent check.
    function totalSoldMilli(itemId: string): number {
      const row = rawDb
        .prepare(
          `SELECT COALESCE(SUM(sl.quantity), 0) AS total FROM sale_line sl JOIN sale ON sale.id = sl.sale_id WHERE sl.item_id = ? AND sale.status = 'confirmed'`,
        )
        .get(itemId) as { total: number };
      return row.total;
    }
    expect(totalSoldMilli(itemA.id)).toBe(5000);
    expect(totalSoldMilli(itemB.id)).toBe(3000);
    expect(totalSoldMilli(itemC.id)).toBe(1000);
    expect(byId.has(itemA.id)).toBe(true);
  });

  it('excludes an item with no sale_line rows', async () => {
    const sold = await repo.createItem({
      itemCode: null,
      nameEn: 'Sold Item',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    const neverSold = await repo.createItem({
      itemCode: null,
      nameEn: 'Never Sold Item',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    insertConfirmedSaleLine(sold.id, 1000);

    const results = await repo.topSellingItems(12);
    expect(results.map((r) => r.id)).toContain(sold.id);
    expect(results.map((r) => r.id)).not.toContain(neverSold.id);
  });

  it('excludes cancelled sales from the ranking', async () => {
    const cancelledOnly = await repo.createItem({
      itemCode: null,
      nameEn: 'Cancelled Sale Item',
      nameUr: null,
      businessUnitId,
      stockUomId,
      trackStock: true,
      retailPricePaisa: 100,
    });
    insertCancelledSaleLine(cancelledOnly.id, 5000);

    const results = await repo.topSellingItems(12);
    expect(results.map((r) => r.id)).not.toContain(cancelledOnly.id);
  });
});
