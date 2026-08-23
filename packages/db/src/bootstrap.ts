import type Database from 'better-sqlite3';
import { newId } from '@shop/shared';

export interface SeedResult {
  readonly tenantInserted: boolean;
  readonly businessUnitsInserted: number;
  readonly priceLevelsInserted: number;
  readonly uomsInserted: number;
  readonly warehousesInserted: number;
}

interface BusinessUnitSeed {
  readonly code: string;
  readonly name: string;
  readonly ownsStock: boolean;
  readonly earnsLabour: boolean;
  readonly isOverhead: boolean;
}

// PARTS/REPAIR/SHARED per ADR-0010 — peer business units plus one
// overhead pool. Codes and shape are fixed; do not make this configurable.
const BUSINESS_UNITS: readonly BusinessUnitSeed[] = [
  { code: 'PARTS', name: 'Spare Parts', ownsStock: true, earnsLabour: false, isOverhead: false },
  { code: 'REPAIR', name: 'Repair', ownsStock: false, earnsLabour: true, isOverhead: false },
  { code: 'SHARED', name: 'Shared', ownsStock: false, earnsLabour: false, isOverhead: true },
];

const DEFAULT_PRICE_LEVEL_NAME = 'Retail';
const DEFAULT_WAREHOUSE_NAME = 'Shop';

// P1-0's minimum set, per the owner's explicit instruction. More can be
// added later through normal CRUD — this is only the bootstrap floor.
const BASE_UOMS: readonly { name: string; allowFraction: boolean }[] = [
  { name: 'Piece', allowFraction: false },
  { name: 'Kg', allowFraction: true },
  { name: 'Cylinder', allowFraction: false },
  { name: 'Foot', allowFraction: true },
];

function seedTenant(db: Database.Database, tenantId: string, now: string): boolean {
  const existing = db.prepare(`SELECT id FROM tenant WHERE id = ?`).get(tenantId);
  if (existing) return false;
  db.prepare(
    `INSERT INTO tenant (id, business_name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run(tenantId, 'Shop', now, now);
  return true;
}

function seedBusinessUnits(db: Database.Database, tenantId: string, now: string): number {
  let inserted = 0;
  BUSINESS_UNITS.forEach((bu, index) => {
    const existing = db
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = ?`)
      .get(tenantId, bu.code);
    if (existing) return;
    db.prepare(
      `INSERT INTO business_unit
         (id, tenant_id, code, name, owns_stock, earns_labour, is_overhead, is_active, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      newId(),
      tenantId,
      bu.code,
      bu.name,
      bu.ownsStock ? 1 : 0,
      bu.earnsLabour ? 1 : 0,
      bu.isOverhead ? 1 : 0,
      index,
      now,
    );
    inserted += 1;
  });
  return inserted;
}

function seedPriceLevel(db: Database.Database, tenantId: string): number {
  const existing = db
    .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = ?`)
    .get(tenantId, DEFAULT_PRICE_LEVEL_NAME);
  if (existing) return 0;
  db.prepare(
    `INSERT INTO price_level (id, tenant_id, name, is_default, sort_order) VALUES (?, ?, ?, 1, 0)`,
  ).run(newId(), tenantId, DEFAULT_PRICE_LEVEL_NAME);
  return 1;
}

function seedUoms(db: Database.Database, tenantId: string): number {
  let inserted = 0;
  for (const uom of BASE_UOMS) {
    const existing = db
      .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = ?`)
      .get(tenantId, uom.name);
    if (existing) continue;
    db.prepare(`INSERT INTO uom (id, tenant_id, name, allow_fraction) VALUES (?, ?, ?, ?)`).run(
      newId(),
      tenantId,
      uom.name,
      uom.allowFraction ? 1 : 0,
    );
    inserted += 1;
  }
  return inserted;
}

function seedWarehouse(db: Database.Database, tenantId: string): number {
  const existing = db
    .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND name = ?`)
    .get(tenantId, DEFAULT_WAREHOUSE_NAME);
  if (existing) return 0;
  db.prepare(`INSERT INTO warehouse (id, tenant_id, name, is_default) VALUES (?, ?, ?, 1)`).run(
    newId(),
    tenantId,
    DEFAULT_WAREHOUSE_NAME,
  );
  return 1;
}

/**
 * Idempotent first-launch bootstrap: tenant row, the three fixed business
 * units, the default Retail price level, the base units of measure, and
 * a default "Shop" warehouse (stock_movement.warehouse_id is required —
 * P1-2's opening-stock import needs somewhere to post against). Safe to
 * call on every startup — each piece is inserted only if missing.
 */
export function seed(db: Database.Database, tenantId: string): SeedResult {
  const now = new Date().toISOString();
  let result: SeedResult = {
    tenantInserted: false,
    businessUnitsInserted: 0,
    priceLevelsInserted: 0,
    uomsInserted: 0,
    warehousesInserted: 0,
  };

  const runSeed = db.transaction(() => {
    const tenantInserted = seedTenant(db, tenantId, now);
    const businessUnitsInserted = seedBusinessUnits(db, tenantId, now);
    const priceLevelsInserted = seedPriceLevel(db, tenantId);
    const uomsInserted = seedUoms(db, tenantId);
    const warehousesInserted = seedWarehouse(db, tenantId);
    result = {
      tenantInserted,
      businessUnitsInserted,
      priceLevelsInserted,
      uomsInserted,
      warehousesInserted,
    };
  });
  runSeed();

  return result;
}
