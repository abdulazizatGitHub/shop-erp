import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { searchItems } from '@shop/core';
import {
  openDatabase,
  migrate,
  seed,
  createKyselyDb,
  KyselyItemRepository,
  setDefaultLowStockThresholdMilli,
} from '@shop/db';
import { runLowStockCount, runNotStockedCount, type ItemHandlerDeps } from './item.handler.js';

const migrationsDir = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let deps: ItemHandlerDeps;
let businessUnitId: string;
let pieceUomId: string;
let warehouseId: string;

// Opens and closes its own connection every call — several tests below
// close the module-scoped rawDb between steps (matching runCreateSale's/
// runLowStockCount's own open/close-per-call contract), so this must
// never depend on rawDb still being open.
function insertStockMovement(itemId: string, warehouseId: string, quantityMilli: number): void {
  const now = new Date().toISOString();
  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, source_type, source_id, reason, reversed_by_id, created_at, created_by, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'opening', ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)`,
  ).run(newId(), TENANT_ID, itemId, warehouseId, now, quantityMilli, now);
  db.close();
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-item-handler-test-'));
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
 * P17-2 (docs/phases/PHASE_17.md §2.2/§8). runLowStockCount is the plain
 * function registerItemHandlers delegates to — tested directly, no
 * electron mocking, same precedent as sale.handler.test.ts.
 */
describe('runLowStockCount', () => {
  it('counts an item at or below its own reorderLevel (via CSV-import-style stock_movement + reorder_level)', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Low Stock Test Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    rawDb = openDatabase(dbPath);
    rawDb.prepare(`UPDATE item SET reorder_level = 5000 WHERE id = ?`).run(item.id);
    rawDb.close();
    insertStockMovement(item.id, warehouseId, 5000); // 5 pieces, at the threshold

    const count = await runLowStockCount(deps);
    expect(count).toBe(1);
  });

  it('the custody scenario: 0 in Shop, 5 with a technician -> flagged and counted (default threshold 0)', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Custody Low Stock Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    const technicianWarehouseId = newId();
    const warehouseDb = openDatabase(dbPath);
    warehouseDb
      .prepare(`INSERT INTO warehouse (id, tenant_id, name, is_default) VALUES (?, ?, ?, ?)`)
      .run(technicianWarehouseId, TENANT_ID, 'Technician — Test', 0);
    warehouseDb.close();
    insertStockMovement(item.id, technicianWarehouseId, 5000); // all 5 with a technician, 0 at Shop

    const count = await runLowStockCount(deps);
    expect(count).toBe(1);
  });

  it('excludes a trackStock=false item, even with 0 quantity (A17-2)', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Non-tracked Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: false,
      retailPricePaisa: 100000,
    });
    db.close();

    const count = await runLowStockCount(deps);
    expect(count).toBe(0);
  });

  it('excludes a deleted item, even with 0 quantity (A17-2)', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Deleted Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    rawDb = openDatabase(dbPath);
    insertStockMovement(item.id, warehouseId, 0);
    rawDb
      .prepare(`UPDATE item SET deleted_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), item.id);
    rawDb.close();

    const count = await runLowStockCount(deps);
    expect(count).toBe(0);
  });

  it('an item above both its own reorder level and the default is not counted', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Well Stocked Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    insertStockMovement(item.id, warehouseId, 50000); // 50 pieces

    const count = await runLowStockCount(deps);
    expect(count).toBe(0);
  });

  it('respects the shop-wide default threshold for items with no reorder_level set', async () => {
    const settingDb = openDatabase(dbPath);
    await setDefaultLowStockThresholdMilli(createKyselyDb(settingDb), TENANT_ID, 10000); // default: 10 pieces
    settingDb.close();

    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Under Shop Default Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    insertStockMovement(item.id, warehouseId, 8000); // 8 pieces — under the 10-piece default

    const count = await runLowStockCount(deps);
    expect(count).toBe(1);
  });

  // This test's guarantee is only as strong as its premise: searchItems
  // (packages/db/src/repositories/item.repository.ts) has no LIMIT/OFFSET
  // anywhere in its SQL today, so one item:search call always returns the
  // WHOLE catalogue and there is no page boundary for the Items-list
  // filter and runLowStockCount to disagree across. If pagination is ever
  // added to that query, this equality stops being guaranteed by
  // construction — the low-stock filter would then need to move
  // server-side (e.g. a lowStockOnly query param applied before any
  // LIMIT), and this test would need to assert against a paginated
  // fetch-all-pages loop instead of a single call.
  it(
    'review fix: with low-stock items scattered across a catalogue larger than any assumed page ' +
      "size, the Items list's client-side filter (item.stockAlert, no re-derivation) and the " +
      'Dashboard count agree exactly — because item.repository.ts.searchItems has no LIMIT/OFFSET ' +
      'at all (confirmed by reading the SQL), there is no page boundary for either side to disagree ' +
      'across',
    async () => {
      const db = openDatabase(dbPath);
      const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
      const itemIds: string[] = [];
      // 30 items — comfortably larger than any typical UI page size (10-25).
      for (let i = 0; i < 30; i++) {
        // Every 4th item is low stock (0 qty, default threshold 0);
        // deliberately scattered through the insertion order, not
        // clustered at either end.
        const item = await itemRepo.createItem({
          itemCode: null,
          nameEn: `Bulk Item ${String(i).padStart(2, '0')}`,
          nameUr: null,
          businessUnitId,
          stockUomId: pieceUomId,
          trackStock: true,
          retailPricePaisa: 100000,
        });
        itemIds.push(item.id);
      }
      db.close();
      for (let i = 0; i < itemIds.length; i++) {
        const id = itemIds[i];
        if (id === undefined) continue;
        // Every 4th item stays at 0 (low stock); the rest get real stock.
        insertStockMovement(id, warehouseId, i % 4 === 0 ? 0 : 50000);
      }

      const readDb = openDatabase(dbPath);
      const readRepo = new KyselyItemRepository(createKyselyDb(readDb), TENANT_ID, DEVICE_CODE);
      const items = await searchItems(readRepo, { query: '', categoryId: null });
      readDb.close();

      expect(items).toHaveLength(30);
      const expectedLowStockCount = itemIds.filter((_, i) => i % 4 === 0).length;
      expect(expectedLowStockCount).toBe(8); // hand-calculated: ceil(30/4) = 8 (indices 0,4,...,28)

      const filteredListCount = items.filter(
        (item) => item.stockAlert === 'out' || item.stockAlert === 'low',
      ).length;
      const dashboardCount = await runLowStockCount(deps);

      expect(filteredListCount).toBe(expectedLowStockCount);
      expect(dashboardCount).toBe(expectedLowStockCount);
      expect(filteredListCount).toBe(dashboardCount);
    },
  );
});

/**
 * P17-2b (docs/phases/PHASE_17.md §9/§8, Q17-7 ANSWERED). An item with
 * a reorder_level set but zero stock_movement rows ever is
 * 'not_stocked' — a distinct state from 'out'/'low', so it must be
 * counted by runNotStockedCount but excluded from both
 * runLowStockCount and the Items-list "Low stock only" filter.
 */
describe('runNotStockedCount', () => {
  it('counts an item with a reorder_level set and zero stock_movement rows ever', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Never Received Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    rawDb = openDatabase(dbPath);
    rawDb.prepare(`UPDATE item SET reorder_level = 5000 WHERE id = ?`).run(item.id);
    rawDb.close();
    // Deliberately no insertStockMovement call — this item has never moved.

    const count = await runNotStockedCount(deps);
    expect(count).toBe(1);
  });

  it('excludes an item with a reorder_level set but no stock history from runLowStockCount — not_stocked is distinct from out/low', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Never Received Item 2',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    rawDb = openDatabase(dbPath);
    rawDb.prepare(`UPDATE item SET reorder_level = 5000 WHERE id = ?`).run(item.id);
    rawDb.close();

    expect(await runLowStockCount(deps)).toBe(0);
    expect(await runNotStockedCount(deps)).toBe(1);
  });

  it('excludes an item with no reorder_level and no stock history (plain null, not not_stocked)', async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Never Received, No Threshold',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    // No reorder_level set, no stock movement — this must be null, not 'not_stocked'.

    expect(await runNotStockedCount(deps)).toBe(0);
  });

  it("excludes a 'not_stocked' item from the Items-list 'Low stock only' filter (the same stockAlert === 'out' || 'low' check ItemsPage.tsx uses)", async () => {
    const db = openDatabase(dbPath);
    const itemRepo = new KyselyItemRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE);
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Never Received Item 3',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    db.close();
    rawDb = openDatabase(dbPath);
    rawDb.prepare(`UPDATE item SET reorder_level = 5000 WHERE id = ?`).run(item.id);
    rawDb.close();

    const readDb = openDatabase(dbPath);
    const readRepo = new KyselyItemRepository(createKyselyDb(readDb), TENANT_ID, DEVICE_CODE);
    const items = await searchItems(readRepo, { query: '', categoryId: null });
    readDb.close();

    const created = items.find((i) => i.id === item.id);
    expect(created?.stockAlert).toBe('not_stocked');
    const lowStockOnlyFiltered = items.filter(
      (i) => i.stockAlert === 'out' || i.stockAlert === 'low',
    );
    expect(lowStockOnlyFiltered.find((i) => i.id === item.id)).toBeUndefined();
  });
});
