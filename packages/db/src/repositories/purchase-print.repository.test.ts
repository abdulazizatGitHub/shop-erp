import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import type { Kysely } from 'kysely';
import { KyselyPurchaseRepository } from './purchase.repository.js';
import { setShopName } from './setting.repository.js';
import { getPurchasePrintData } from './purchase-print.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let repo: KyselyPurchaseRepository;
let supplierId: string;
let pieceUomId: string;
let compressorItemId: string;

function insertItem(
  id: string,
  nameEn: string,
  stockUomId: string,
  purchaseUomId: string | null,
  purchaseToStockFactor: number,
): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO item
         (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id,
          purchase_uom_id, purchase_to_stock_factor, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, (SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'),
               ?, ?, ?, 1, ?, ?)`,
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
      now,
      now,
    );
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-purchase-print-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  kysely = createKyselyDb(rawDb);
  repo = new KyselyPurchaseRepository(kysely, TENANT_ID, DEVICE_CODE);

  pieceUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;

  const now = new Date().toISOString();
  supplierId = '10000000-0000-1000-8000-000000000001';
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, shop_name, phone, city_area, is_active, created_at, updated_at)
       VALUES (?, ?, 'SUP-A-000001', 'supplier', 'Test Gas & Compressor Supplier', 'Metro Refrigeration', '0300', 'Malakand', 1, ?, ?)`,
    )
    .run(supplierId, TENANT_ID, now, now);

  compressorItemId = '20000000-0000-1000-8000-000000000001';
  insertItem(compressorItemId, 'Compressor 1.5 Ton', pieceUomId, pieceUomId, 1000);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('getPurchasePrintData', () => {
  it('returns null for a purchase that does not exist', async () => {
    const data = await getPurchasePrintData(kysely, TENANT_ID, 'nonexistent-id');
    expect(data).toBeNull();
  });

  it('returns full print data, including a hand-calculated total', async () => {
    await setShopName(kysely, TENANT_ID, 'Al-Falah Traders');

    // 2 compressors @ Rs 5,000 each (1:1 purchase-to-stock factor):
    //   lineTotal = 500,000 paisa * 2000 / 1000 = 1,000,000 paisa = Rs 10,000
    const created = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'credit',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 2000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    const data = await getPurchasePrintData(kysely, TENANT_ID, created.id);

    expect(data).not.toBeNull();
    expect(data?.docNo).toBe(created.docNo);
    expect(data?.purchaseDate).toBe('2026-08-24');
    expect(data?.paymentMode).toBe('credit');
    expect(data?.supplierName).toBe('Test Gas & Compressor Supplier');
    expect(data?.supplierShopName).toBe('Metro Refrigeration');
    expect(data?.supplierPhone).toBe('0300');
    expect(data?.supplierCityArea).toBe('Malakand');
    expect(data?.shopName).toBe('Al-Falah Traders');
    expect(data?.lines).toHaveLength(1);
    expect(data?.lines[0]?.itemName).toBe('Compressor 1.5 Ton');
    expect(data?.lines[0]?.quantityMilli).toBe(2000);
    expect(data?.lines[0]?.unitName).toBe('Piece');
    expect(data?.lines[0]?.unitCostPaisa).toBe(500_000);
    expect(data?.lines[0]?.lineTotalPaisa).toBe(1_000_000);
    // Hand-calculated: 2 pieces x Rs 5,000 = Rs 10,000 = 1,000,000 paisa
    expect(data?.totalAmountPaisa).toBe(1_000_000);
  });
});
