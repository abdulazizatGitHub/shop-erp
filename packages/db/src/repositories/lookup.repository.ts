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

/**
 * Plain reference-data reads — no business logic, so these skip the
 * core port/service pattern used for item writes. Not a precedent for
 * skipping it on anything that has an actual rule attached.
 */
export async function listBusinessUnits(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly BusinessUnitOption[]> {
  const rows = await db
    .selectFrom('businessUnit')
    .select(['id', 'code', 'name'])
    .where('tenantId', '=', tenantId)
    .where('isActive', '=', 1)
    .where('isOverhead', '=', 0)
    .orderBy('sortOrder')
    .execute();
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
