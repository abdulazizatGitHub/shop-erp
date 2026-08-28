import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

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
