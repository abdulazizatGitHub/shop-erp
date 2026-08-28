import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migration-runner.js';
import { seed } from './bootstrap.js';

const migrationsDir = path.join(import.meta.dirname, 'migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-seed-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('seed', () => {
  it('inserts the tenant, three business units, one price level, ten uoms, one warehouse', () => {
    const db = new Database(dbPath);
    const result = seed(db, TENANT_ID);
    db.close();

    expect(result).toEqual({
      tenantInserted: true,
      businessUnitsInserted: 3,
      priceLevelsInserted: 1,
      uomsInserted: 10,
      warehousesInserted: 1,
    });
  });

  it('is idempotent — running twice inserts nothing the second time', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const second = seed(db, TENANT_ID);
    db.close();

    expect(second).toEqual({
      tenantInserted: false,
      businessUnitsInserted: 0,
      priceLevelsInserted: 0,
      uomsInserted: 0,
      warehousesInserted: 0,
    });
  });

  it('seeds exactly one default "Shop" warehouse', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const rows = db
      .prepare(`SELECT name, is_default FROM warehouse WHERE tenant_id = ?`)
      .all(TENANT_ID);
    db.close();

    expect(rows).toEqual([{ name: 'Shop', is_default: 1 }]);
  });

  it('seeds business_unit codes and flags exactly per ADR-0010', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const rows = db
      .prepare(
        `SELECT code, owns_stock, earns_labour, is_overhead FROM business_unit
         WHERE tenant_id = ? ORDER BY code`,
      )
      .all(TENANT_ID);
    db.close();

    expect(rows).toEqual([
      { code: 'PARTS', owns_stock: 1, earns_labour: 0, is_overhead: 0 },
      { code: 'REPAIR', owns_stock: 0, earns_labour: 1, is_overhead: 0 },
      { code: 'SHARED', owns_stock: 0, earns_labour: 0, is_overhead: 1 },
    ]);
  });

  it('seeds exactly one default Retail price level', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const rows = db
      .prepare(`SELECT name, is_default FROM price_level WHERE tenant_id = ?`)
      .all(TENANT_ID);
    db.close();

    expect(rows).toEqual([{ name: 'Retail', is_default: 1 }]);
  });

  it('seeds all 10 base uoms — the original 4 plus the 6 ADR-0013 uom_conversion units', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const rows = db
      .prepare(`SELECT name FROM uom WHERE tenant_id = ? ORDER BY name`)
      .all(TENANT_ID) as Array<{ name: string }>;
    db.close();

    expect(rows.map((r) => r.name)).toEqual([
      'Centimeter',
      'Cylinder',
      'Foot',
      'Gram',
      'Inch',
      'Kg',
      'Liter',
      'Meter',
      'Milliliter',
      'Piece',
    ]);
  });
});

describe('seed — uom_conversion (ADR-0013, P3.5E)', () => {
  it('Kg -> Gram: factor_milli = 1000000 (1 Kg = 1000 Gram, 1000 x 1000)', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const row = db
      .prepare(
        `SELECT uc.factor_milli FROM uom_conversion uc
         JOIN uom f ON f.id = uc.from_uom_id
         JOIN uom t ON t.id = uc.to_uom_id
         WHERE f.name = 'Kg' AND t.name = 'Gram' AND uc.tenant_id = ?`,
      )
      .get(TENANT_ID) as { factor_milli: number } | undefined;
    db.close();

    expect(row?.factor_milli).toBe(1000000);
  });

  it('Liter -> Milliliter: factor_milli = 1000000 (1 Liter = 1000 Milliliter, 1000 x 1000)', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const row = db
      .prepare(
        `SELECT uc.factor_milli FROM uom_conversion uc
         JOIN uom f ON f.id = uc.from_uom_id
         JOIN uom t ON t.id = uc.to_uom_id
         WHERE f.name = 'Liter' AND t.name = 'Milliliter' AND uc.tenant_id = ?`,
      )
      .get(TENANT_ID) as { factor_milli: number } | undefined;
    db.close();

    expect(row?.factor_milli).toBe(1000000);
  });

  it('Foot -> Inch: factor_milli = 12000 (1 Foot = 12 Inch, 12 x 1000)', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const row = db
      .prepare(
        `SELECT uc.factor_milli FROM uom_conversion uc
         JOIN uom f ON f.id = uc.from_uom_id
         JOIN uom t ON t.id = uc.to_uom_id
         WHERE f.name = 'Foot' AND t.name = 'Inch' AND uc.tenant_id = ?`,
      )
      .get(TENANT_ID) as { factor_milli: number } | undefined;
    db.close();

    expect(row?.factor_milli).toBe(12000);
  });

  it('Meter -> Centimeter: factor_milli = 100000 (1 Meter = 100 Centimeter, 100 x 1000)', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const row = db
      .prepare(
        `SELECT uc.factor_milli FROM uom_conversion uc
         JOIN uom f ON f.id = uc.from_uom_id
         JOIN uom t ON t.id = uc.to_uom_id
         WHERE f.name = 'Meter' AND t.name = 'Centimeter' AND uc.tenant_id = ?`,
      )
      .get(TENANT_ID) as { factor_milli: number } | undefined;
    db.close();

    expect(row?.factor_milli).toBe(100000);
  });
});
