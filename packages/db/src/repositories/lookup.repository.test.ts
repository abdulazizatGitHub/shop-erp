import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newId } from '@shop/shared';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyItemRepository } from './item.repository.js';
import { getItemPrices } from './lookup.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let rawDb: Database.Database;
let itemId: string;
let retailLevelId: string;

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-lookup-repo-test-'));
  const dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  const itemRepo = new KyselyItemRepository(kysely, TENANT_ID, DEVICE_CODE);

  const businessUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  const stockUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  retailLevelId = (
    rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'`)
      .get(TENANT_ID) as { id: string }
  ).id;

  const created = await itemRepo.createItem({
    itemCode: null,
    nameEn: 'Compressor',
    nameUr: null,
    businessUnitId,
    stockUomId,
    trackStock: true,
    // createItem inserts this as the Retail item_price row.
    retailPricePaisa: 600000,
  });
  itemId = created.id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('getItemPrices', () => {
  it('a wholesale customer with a Wholesale item_price gets the Wholesale price', async () => {
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
         VALUES (?, ?, ?, ?, 450000, ?, ?)`,
      )
      .run(
        newId(),
        TENANT_ID,
        itemId,
        wholesaleLevelId,
        '2026-01-01T00:00:00.000Z',
        new Date().toISOString(),
      );

    const kysely = createKyselyDb(rawDb);
    const result = await getItemPrices(kysely, TENANT_ID, [itemId], wholesaleLevelId);

    expect(result[itemId]).toEqual({ retailPaisa: 600000, levelPaisa: 450000 });
  });

  it('priceLevelId null (walk-in) returns the retail price with levelPaisa null', async () => {
    const kysely = createKyselyDb(rawDb);
    const result = await getItemPrices(kysely, TENANT_ID, [itemId], null);

    expect(result[itemId]).toEqual({ retailPaisa: 600000, levelPaisa: null });
  });

  it('a customer on a level with no item_price row falls back to Retail for levelPaisa', async () => {
    const wholesaleLevelId = newId();
    rawDb
      .prepare(
        `INSERT INTO price_level (id, tenant_id, name, is_default, margin_bp, sort_order)
         VALUES (?, ?, 'Wholesale', 0, NULL, 1)`,
      )
      .run(wholesaleLevelId, TENANT_ID);
    // Deliberately NOT inserting a Wholesale item_price row.

    const kysely = createKyselyDb(rawDb);
    const result = await getItemPrices(kysely, TENANT_ID, [itemId], wholesaleLevelId);

    expect(result[itemId]).toEqual({ retailPaisa: 600000, levelPaisa: 600000 });
  });

  it('the most recently dated item_price row wins when a level has more than one', async () => {
    // A second, newer Retail row for the same item+level — ORDER BY
    // effective_from DESC means resolvePricePaisa must see this one first.
    rawDb
      .prepare(
        `INSERT INTO item_price (id, tenant_id, item_id, price_level_id, price, effective_from, created_at)
         VALUES (?, ?, ?, ?, 650000, ?, ?)`,
      )
      .run(
        newId(),
        TENANT_ID,
        itemId,
        retailLevelId,
        '2099-01-01T00:00:00.000Z',
        new Date().toISOString(),
      );

    const kysely = createKyselyDb(rawDb);
    const result = await getItemPrices(kysely, TENANT_ID, [itemId], null);

    expect(result[itemId]?.retailPaisa).toBe(650000);
  });
});
