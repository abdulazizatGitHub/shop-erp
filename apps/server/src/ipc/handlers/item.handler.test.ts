import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import {
  openDatabase,
  migrate,
  seed,
  createKyselyDb,
  KyselyItemRepository,
  setDefaultLowStockThresholdMilli,
} from '@shop/db';
import { runLowStockCount, type ItemHandlerDeps } from './item.handler.js';

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
});
