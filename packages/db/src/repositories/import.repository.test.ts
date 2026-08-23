import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ITEM_COLUMNS,
  OPENING_STOCK_COLUMNS,
  parseCsv,
  validateItemRows,
  validateOpeningStockRows,
} from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyImportRepository } from './import.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const itemsFixturePath = path.join(
  import.meta.dirname,
  '../../../core/src/import/__fixtures__/items.csv',
);
const openingStockFixturePath = path.join(
  import.meta.dirname,
  '../../../core/src/import/__fixtures__/opening_stock.csv',
);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyImportRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-import-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  repo = new KyselyImportRepository(createKyselyDb(rawDb), TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

async function importItemsFixture(): Promise<void> {
  const csvText = readFileSync(itemsFixturePath, 'utf8');
  const { rows } = parseCsv(csvText, ITEM_COLUMNS);
  const lookups = await repo.getItemImportLookups();
  const results = validateItemRows(rows, lookups);
  const accepted = results.filter((r) => r.status === 'accepted').map((r) => r.record);
  await repo.insertImportedItems(accepted);
}

describe('full import pipeline against the real DB', () => {
  it('inserts exactly the 4 accepted items from the fixture', async () => {
    await importItemsFixture();

    const rows = rawDb
      .prepare(`SELECT item_code, name_en FROM item WHERE tenant_id = ? ORDER BY name_en`)
      .all(TENANT_ID);
    expect(rows).toHaveLength(4);
  });

  it('stores the gas item cost correctly end to end — the UoM-conversion case', async () => {
    await importItemsFixture();

    const row = rawDb
      .prepare(`SELECT last_purchase_cost, avg_cost FROM item WHERE tenant_id = ? AND name_en = ?`)
      .get(TENANT_ID, 'Gas R-134a') as { last_purchase_cost: number; avg_cost: number };

    // Same hand calculation as packages/core's test, now proven through
    // the real repository + real SQLite row, not just the pure function.
    // 1 cylinder @ Rs 35,000, 13.6 kg/cylinder -> Rs 2,573.53/kg = 257353 paisa
    expect(row.last_purchase_cost).toBe(257_353);
    expect(row.avg_cost).toBe(257_353);
  });

  it('re-running the same import does not duplicate items — neither coded nor blank-code rows', async () => {
    await importItemsFixture();
    await importItemsFixture();

    // Explicit-code rows (Copper Pipe 10ft = CU-PIPE-01, Fan Motor =
    // FAN-MOTOR-01) are rejected on re-run via existingItemCodes.
    // Blank-code rows (Gas R-134a, 1.5 Ton Compressor) are skipped via
    // existingItemNames — a blank code alone would get a fresh
    // auto-generated code every run and silently duplicate the item.
    // Either way, the count after re-running must still be 4, not 8.
    const count = rawDb
      .prepare(`SELECT COUNT(*) AS n FROM item WHERE tenant_id = ?`)
      .get(TENANT_ID) as { n: number };
    expect(count.n).toBe(4);
  });

  it('posts opening stock and matches names case-insensitively, end to end', async () => {
    await importItemsFixture();
    const warehouseId = await repo.getDefaultWarehouseId();

    const csvText = readFileSync(openingStockFixturePath, 'utf8');
    const { rows } = parseCsv(csvText, OPENING_STOCK_COLUMNS);
    const lookups = await repo.getOpeningStockLookups();
    const results = validateOpeningStockRows(rows, lookups);
    const accepted = results.filter((r) => r.status === 'accepted').map((r) => r.record);
    expect(accepted).toHaveLength(4);
    await repo.insertOpeningStockMovements(accepted, warehouseId);

    const gasMovement = rawDb
      .prepare(
        `SELECT sm.quantity, sm.unit_cost FROM stock_movement sm
         JOIN item i ON i.id = sm.item_id
         WHERE i.name_en = ? AND sm.movement_type = 'opening'`,
      )
      .get('Gas R-134a') as { quantity: number; unit_cost: number };

    // Fixture: 40 kg @ Rs 2,573.53/kg -> 40000 milli-kg, 257353 paisa
    expect(gasMovement.quantity).toBe(40_000);
    expect(gasMovement.unit_cost).toBe(257_353);
  });

  it('re-running opening stock skips items that already have an opening movement', async () => {
    await importItemsFixture();
    const warehouseId = await repo.getDefaultWarehouseId();
    const csvText = readFileSync(openingStockFixturePath, 'utf8');
    const { rows } = parseCsv(csvText, OPENING_STOCK_COLUMNS);

    const lookups1 = await repo.getOpeningStockLookups();
    const results1 = validateOpeningStockRows(rows, lookups1);
    const accepted1 = results1.filter((r) => r.status === 'accepted').map((r) => r.record);
    await repo.insertOpeningStockMovements(accepted1, warehouseId);

    const lookups2 = await repo.getOpeningStockLookups();
    const results2 = validateOpeningStockRows(rows, lookups2);

    expect(results2.filter((r) => r.status === 'skipped')).toHaveLength(4);
    expect(results2.filter((r) => r.status === 'accepted')).toHaveLength(0);

    const count = rawDb
      .prepare(`SELECT COUNT(*) AS n FROM stock_movement WHERE movement_type = 'opening'`)
      .get() as { n: number };
    expect(count.n).toBe(4); // not 8 — the second run posted nothing new
  });
});
