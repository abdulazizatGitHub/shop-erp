import type { Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

export interface BusinessUnitOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface UomOption {
  readonly id: string;
  readonly name: string;
}

export interface CategoryOption {
  readonly id: string;
  readonly name: string;
}

export interface UomConversionOption {
  readonly id: string;
  readonly fromUomId: string;
  readonly fromUomName: string;
  readonly toUomId: string;
  readonly toUomName: string;
  readonly factorMilli: number;
}

export interface TechnicianOption {
  readonly id: string;
  readonly name: string;
}

export interface ServiceChargeOption {
  readonly id: string;
  readonly name: string;
  readonly businessUnitId: string;
  readonly retailChargePaisa: number;
}

/**
 * Plain reference-data reads — no business logic, so these skip the
 * core port/service pattern used for item writes. Not a precedent for
 * skipping it on anything that has an actual rule attached.
 */
/**
 * includeOverhead=false (default) preserves the existing item:lookups
 * behaviour (items only ever belong to PARTS/REPAIR). Phase 7's expense
 * form needs all three units, including SHARED — pass true there rather
 * than duplicating this query.
 */
export async function listBusinessUnits(
  db: Kysely<Database>,
  tenantId: string,
  includeOverhead = false,
): Promise<readonly BusinessUnitOption[]> {
  let query = db
    .selectFrom('businessUnit')
    .select(['id', 'code', 'name'])
    .where('tenantId', '=', tenantId)
    .where('isActive', '=', 1);
  if (!includeOverhead) {
    query = query.where('isOverhead', '=', 0);
  }
  const rows = await query.orderBy('sortOrder').execute();
  return rows;
}

export async function listUoms(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly UomOption[]> {
  const rows = await db
    .selectFrom('uom')
    .select(['id', 'name'])
    .where('tenantId', '=', tenantId)
    .orderBy('name')
    .execute();
  return rows;
}

export async function listCategories(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly CategoryOption[]> {
  const rows = await db
    .selectFrom('category')
    .select(['id', 'name'])
    .where('tenantId', '=', tenantId)
    .where('deletedAt', 'is', null)
    .orderBy('name')
    .execute();
  return rows;
}

/**
 * Technicians for assignment/delivery pickers. Deliberately reads
 * party.staff_role, NOT warehouse.warehouse_kind='technician' — a
 * technician's custody warehouse is only lazily created on their first
 * parts issue (job-part.repository.ts), so a brand-new technician with
 * no custody history yet would be wrongly excluded by a warehouse-based
 * query, even though they must still be assignable to a job at intake.
 */
export async function listTechnicians(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly TechnicianOption[]> {
  const rows = await db
    .selectFrom('party')
    .select(['id', 'name'])
    .where('tenantId', '=', tenantId)
    .where('partyType', '=', 'staff')
    .where('staffRole', '=', 'technician')
    .where('isActive', '=', 1)
    .where('deletedAt', 'is', null)
    .orderBy('name')
    .execute();
  return rows;
}

export async function listServiceCharges(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly ServiceChargeOption[]> {
  const rows = await db
    .selectFrom('serviceCharge')
    .select(['id', 'name', 'businessUnitId', 'retailCharge'])
    .where('tenantId', '=', tenantId)
    .where('isActive', '=', 1)
    .orderBy('name')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    businessUnitId: r.businessUnitId,
    retailChargePaisa: r.retailCharge,
  }));
}

/** ADR-0013 Type 1 fixed conversions, seeded in bootstrap.ts (P3.5E) — read-only, no UI to manage them yet (Phase 4+). */
export async function listUomConversions(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly UomConversionOption[]> {
  const rows = await db
    .selectFrom('uomConversion')
    .innerJoin('uom as fromUom', 'fromUom.id', 'uomConversion.fromUomId')
    .innerJoin('uom as toUom', 'toUom.id', 'uomConversion.toUomId')
    .select([
      'uomConversion.id',
      'uomConversion.fromUomId',
      'fromUom.name as fromUomName',
      'uomConversion.toUomId',
      'toUom.name as toUomName',
      'uomConversion.factorMilli',
    ])
    .where('uomConversion.tenantId', '=', tenantId)
    .orderBy('fromUom.name')
    .orderBy('toUom.name')
    .execute();
  return rows;
}
