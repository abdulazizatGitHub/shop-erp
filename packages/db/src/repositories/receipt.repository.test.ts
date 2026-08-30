import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import { KyselyItemRepository } from './item.repository.js';
import { KyselySaleRepository } from './sale.repository.js';
import { getSaleReceiptData } from './receipt.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let itemRepo: KyselyItemRepository;
let saleRepo: KyselySaleRepository;
let businessUnitId: string;
let pieceUomId: string;
let kgUomId: string;
let footUomId: string;

function insertStockMovement(itemId: string, quantityMilli: number, warehouseId: string): void {
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, created_at)
       VALUES (?, ?, ?, ?, ?, 'opening', ?, ?)`,
    )
    .run(
      newId(),
      TENANT_ID,
      itemId,
      warehouseId,
      '2026-08-01',
      quantityMilli,
      new Date().toISOString(),
    );
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-receipt-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  itemRepo = new KyselyItemRepository(kysely, TENANT_ID, DEVICE_CODE);
  saleRepo = new KyselySaleRepository(kysely, TENANT_ID, DEVICE_CODE);

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
  kgUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  footUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Foot'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('getSaleReceiptData (P4-1c)', () => {
  it('returns null when the sale does not exist', async () => {
    const data = await getSaleReceiptData(kysely, TENANT_ID, newId());
    expect(data).toBeNull();
  });

  it('returns doc number, timestamp, and line data with correct UoM for both stock-unit and alt-unit lines', async () => {
    const warehouseId = (
      rawDb
        .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
        .get(TENANT_ID) as { id: string }
    ).id;

    // Item A: stocked and sold in Piece — no sale_uom_id, must fall back
    // to item.stock_uom_id's name ("Piece").
    const compressor = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Compressor 1.5 Ton',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 500000,
    });
    insertStockMovement(compressor.id, 10000, warehouseId);

    // Item B: stocked in Kg, sold by the Foot (alt unit) — sale_uom_id
    // IS set, must use that UoM's name ("Foot"), not the stock UoM.
    const pipe = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Copper Pipe 1/4"',
      nameUr: null,
      businessUnitId,
      stockUomId: kgUomId,
      trackStock: true,
      retailPricePaisa: 30000,
      altUomId: footUomId,
      altUomFactorMilli: 305,
    });
    insertStockMovement(pipe.id, 50000, warehouseId);

    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-29',
      paymentMode: 'cash',
      paidAmountPaisa: 1300000,
      notes: null,
      lines: [
        { itemId: compressor.id, quantityMilli: 2000, unitPricePaisa: null },
        {
          itemId: pipe.id,
          quantityMilli: 10000,
          unitPricePaisa: null,
          saleUomId: footUomId,
          saleToStockFactor: 305,
        },
      ],
    });

    const data = await getSaleReceiptData(kysely, TENANT_ID, result.id);
    expect(data).not.toBeNull();
    expect(data?.docNo).toBe(result.docNo);
    expect(typeof data?.createdAt).toBe('string');
    expect(data?.createdAt.length).toBeGreaterThan(0);
    expect(data?.totalAmountPaisa).toBe(result.totalAmountPaisa);

    expect(data?.lines).toHaveLength(2);

    // Line 1 hand calc: 500,000 paisa x 2000 milli / 1000 = 1,000,000 paisa
    const line1 = data?.lines[0];
    expect(line1?.itemName).toBe('Compressor 1.5 Ton');
    expect(line1?.quantityMilli).toBe(2000);
    expect(line1?.unitName).toBe('Piece'); // fell back to stock UoM
    expect(line1?.unitPricePaisa).toBe(500000);
    expect(line1?.lineTotalPaisa).toBe(1000000);

    // Line 2 hand calc: 30,000 paisa x 10,000 milli / 1000 = 300,000 paisa
    const line2 = data?.lines[1];
    expect(line2?.itemName).toBe('Copper Pipe 1/4"');
    expect(line2?.quantityMilli).toBe(10000);
    expect(line2?.unitName).toBe('Foot'); // used sale UoM, not stock UoM (Kg)
    expect(line2?.unitPricePaisa).toBe(30000);
    expect(line2?.lineTotalPaisa).toBe(300000);

    expect(data?.totalAmountPaisa).toBe(1300000); // 1,000,000 + 300,000
  });
});
