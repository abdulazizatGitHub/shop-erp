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
  it('inserts the tenant, three business units, one price level, four uoms', () => {
    const db = new Database(dbPath);
    const result = seed(db, TENANT_ID);
    db.close();

    expect(result).toEqual({
      tenantInserted: true,
      businessUnitsInserted: 3,
      priceLevelsInserted: 1,
      uomsInserted: 4,
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
    });
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

  it('seeds Piece, Kg, Cylinder, Foot uoms', () => {
    const db = new Database(dbPath);
    seed(db, TENANT_ID);
    const rows = db
      .prepare(`SELECT name FROM uom WHERE tenant_id = ? ORDER BY name`)
      .all(TENANT_ID) as Array<{ name: string }>;
    db.close();

    expect(rows.map((r) => r.name)).toEqual(['Cylinder', 'Foot', 'Kg', 'Piece']);
  });
});
