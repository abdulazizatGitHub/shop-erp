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
import { KyselyPartyRepository } from './party.repository.js';
import { KyselySaleRepository } from './sale.repository.js';
import { getSaleInvoiceData } from './invoice.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let itemRepo: KyselyItemRepository;
let partyRepo: KyselyPartyRepository;
let saleRepo: KyselySaleRepository;
let businessUnitId: string;
let pieceUomId: string;
let kgUomId: string;
let footUomId: string;
let warehouseId: string;

function insertStockMovement(itemId: string, quantityMilli: number): void {
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

/** No app write-path sets party.address yet (CreateCustomerInput has no
 * address field) — set directly for the test fixture, same as other
 * tests set columns with no dedicated write API yet (e.g. last_purchase_cost). */
function setCustomerAddress(customerId: string, address: string): void {
  rawDb.prepare(`UPDATE party SET address = ? WHERE id = ?`).run(address, customerId);
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-invoice-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  itemRepo = new KyselyItemRepository(kysely, TENANT_ID, DEVICE_CODE);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
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
  warehouseId = (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as { id: string }
  ).id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('getSaleInvoiceData (P4-2)', () => {
  it('returns null when the sale does not exist', async () => {
    const data = await getSaleInvoiceData(kysely, TENANT_ID, newId());
    expect(data).toBeNull();
  });

  it('returns customer name/phone/address, sale date, lines, and a correctly computed balance due for a wholesale customer', async () => {
    const customer = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Malik Traders',
      shopName: 'Malik Electronics',
      phone: '0300-1234567',
      customerType: 'wholesale',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    setCustomerAddress(customer.id, 'Main Bazaar, Malakand');

    const compressor = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Compressor 1.5 Ton',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 500000,
    });
    insertStockMovement(compressor.id, 10000);

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
    insertStockMovement(pipe.id, 50000);

    // Hand calculation:
    //   Line 1: 500,000 paisa x 2000 milli / 1000 = 1,000,000 paisa
    //   Line 2:  30,000 paisa x 10,000 milli / 1000 = 300,000 paisa
    //   totalAmountPaisa = 1,000,000 + 300,000 = 1,300,000 paisa
    //   paidAmountPaisa  = 500,000 paisa (partial payment, credit sale)
    //   balanceDuePaisa  = 1,300,000 - 500,000 = 800,000 paisa
    const result = await saleRepo.createSale({
      customerId: customer.id,
      warehouseId: null,
      saleDate: '2026-08-30',
      paymentMode: 'credit',
      paidAmountPaisa: 500000,
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

    const data = await getSaleInvoiceData(kysely, TENANT_ID, result.id);
    expect(data).not.toBeNull();

    expect(data?.docNo).toBe(result.docNo);
    expect(data?.saleDate).toBe('2026-08-30');
    expect(data?.customerName).toBe('Malik Traders');
    expect(data?.customerPhone).toBe('0300-1234567');
    expect(data?.customerAddress).toBe('Main Bazaar, Malakand');

    expect(data?.lines).toHaveLength(2);
    const line1 = data?.lines[0];
    expect(line1?.itemName).toBe('Compressor 1.5 Ton');
    expect(line1?.quantityMilli).toBe(2000);
    expect(line1?.unitName).toBe('Piece');
    expect(line1?.unitPricePaisa).toBe(500000);
    expect(line1?.lineTotalPaisa).toBe(1000000);

    const line2 = data?.lines[1];
    expect(line2?.itemName).toBe('Copper Pipe 1/4"');
    expect(line2?.quantityMilli).toBe(10000);
    expect(line2?.unitName).toBe('Foot');
    expect(line2?.unitPricePaisa).toBe(30000);
    expect(line2?.lineTotalPaisa).toBe(300000);

    expect(data?.totalAmountPaisa).toBe(1300000);
    expect(data?.paidAmountPaisa).toBe(500000);
    // balanceDuePaisa must be asserted explicitly, not inferred from the
    // two figures above.
    expect(data?.balanceDuePaisa).toBe(800000);
  });

  it('returns null customer fields for a walk-in sale (customerId null) rather than throwing', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Walk-in Item',
      nameUr: null,
      businessUnitId,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(item.id, 5000);

    const result = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-30',
      paymentMode: 'cash',
      paidAmountPaisa: 100000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: null }],
    });

    const data = await getSaleInvoiceData(kysely, TENANT_ID, result.id);
    expect(data).not.toBeNull();
    expect(data?.customerName).toBeNull();
    expect(data?.customerPhone).toBeNull();
    expect(data?.customerAddress).toBeNull();
    // fully paid, no balance
    expect(data?.balanceDuePaisa).toBe(0);
  });
});
