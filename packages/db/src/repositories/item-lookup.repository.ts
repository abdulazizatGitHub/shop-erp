import type { Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

/**
 * P9C. Plain exported function, not a KyselyItemRepository method — matches
 * price-history.repository.ts's precedent: item.repository.ts was already
 * at/over the 300-line cap when this lookup was needed, so it lives in its
 * own file instead of growing that class.
 */
export interface ItemCodeLookupRow {
  readonly id: string;
  readonly itemCode: string;
}

export async function getItemsByCode(
  db: Kysely<Database>,
  tenantId: string,
  codes: readonly string[],
): Promise<readonly ItemCodeLookupRow[]> {
  if (codes.length === 0) return [];
  return db
    .selectFrom('item')
    .select(['id', 'itemCode'])
    .where('tenantId', '=', tenantId)
    .where('itemCode', 'in', codes as string[])
    .execute();
}
