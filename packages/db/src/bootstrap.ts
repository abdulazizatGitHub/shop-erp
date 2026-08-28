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
// The 6 entries below Foot were added in P3.5E (ADR-0013) so the fixed
// uom_conversion seed below has both sides of each conversion to
// reference. allowFraction: physically-fractional measurements in this
// shop's context (Liter, Meter, Centimeter) get true; measurements that
// are always whole here (Gram, Milliliter, Inch) get false — same
// reasoning as Piece/Cylinder above.
const BASE_UOMS: readonly { name: string; allowFraction: boolean }[] = [
  { name: 'Piece', allowFraction: false },
  { name: 'Kg', allowFraction: true },
  { name: 'Cylinder', allowFraction: false },
  { name: 'Foot', allowFraction: true },
  { name: 'Gram', allowFraction: false },
  { name: 'Liter', allowFraction: true },
  { name: 'Milliliter', allowFraction: false },
  { name: 'Inch', allowFraction: false },
  { name: 'Meter', allowFraction: true },
  { name: 'Centimeter', allowFraction: true },
];

interface UomConversionSeed {
  readonly fromName: string;
  readonly toName: string;
  readonly factorMilli: number;
}

// ADR-0013 Type 1 — fixed system conversions, seeded at bootstrap
// (never in a migration — see 0007_uom_conversion.sql). Reuses the
// existing Kg/Foot rows as-is (H1 decision — Kg is not renamed).
//   Kg -> Gram:        1 Kg = 1000 Gram        -> factor_milli = 1000 * 1000 = 1,000,000
//   Liter -> Milliliter: 1 Liter = 1000 Milliliter -> factor_milli = 1000 * 1000 = 1,000,000
//   Foot -> Inch:      1 Foot = 12 Inch        -> factor_milli = 12 * 1000 = 12,000
//   Meter -> Centimeter: 1 Meter = 100 Centimeter -> factor_milli = 100 * 1000 = 100,000
const BASE_UOM_CONVERSIONS: readonly UomConversionSeed[] = [
  { fromName: 'Kg', toName: 'Gram', factorMilli: 1_000_000 },
  { fromName: 'Liter', toName: 'Milliliter', factorMilli: 1_000_000 },
  { fromName: 'Foot', toName: 'Inch', factorMilli: 12_000 },
  { fromName: 'Meter', toName: 'Centimeter', factorMilli: 100_000 },
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

// Idempotent on (tenant_id, from_uom_id, to_uom_id) — the same
// SELECT-before-INSERT pattern as seedUoms/seedBusinessUnits above, just
// keyed by the resolved uom ids instead of a name.
function seedUomConversions(db: Database.Database, tenantId: string): number {
  let inserted = 0;
  for (const conv of BASE_UOM_CONVERSIONS) {
    const fromUom = db
      .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = ?`)
      .get(tenantId, conv.fromName) as { id: string } | undefined;
    const toUom = db
      .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = ?`)
      .get(tenantId, conv.toName) as { id: string } | undefined;
    if (!fromUom || !toUom) {
      throw new Error(
        `uom_conversion seed: '${conv.fromName}' or '${conv.toName}' UoM not found for ` +
          `tenant ${tenantId} — has seedUoms run first?`,
      );
    }
    const existing = db
      .prepare(
        `SELECT id FROM uom_conversion WHERE tenant_id = ? AND from_uom_id = ? AND to_uom_id = ?`,
      )
      .get(tenantId, fromUom.id, toUom.id);
    if (existing) continue;
    db.prepare(
      `INSERT INTO uom_conversion (id, tenant_id, from_uom_id, to_uom_id, factor_milli) VALUES (?, ?, ?, ?, ?)`,
    ).run(newId(), tenantId, fromUom.id, toUom.id, conv.factorMilli);
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
    // Must run after seedUoms — looks up from_uom_id/to_uom_id by name
    // against the rows seedUoms just inserted. Not tracked in
    // SeedResult (no test/caller needs the count; keeps the returned
    // shape unchanged from before P3.5E).
    seedUomConversions(db, tenantId);
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
