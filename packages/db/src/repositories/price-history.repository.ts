import type { Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

/**
 * P9U-8. Plain exported function, not a port/service pair — matches
 * wage-report.repository.ts's established precedent for a single
 * read-only query with no other write path: no
 * ItemPriceHistoryRepositoryPort exists, and this table is only ever
 * written by grn.repository.ts's own transaction, never here.
 */
export interface ItemPriceHistoryRow {
  readonly id: string;
  readonly itemId: string;
  readonly priceType: string;
  readonly oldValuePaisa: number;
  readonly newValuePaisa: number;
  readonly changedAt: string;
  readonly sourceType: string;
  readonly sourceId: string;
}

export async function getItemPriceHistory(
  db: Kysely<Database>,
  tenantId: string,
  itemId: string,
): Promise<readonly ItemPriceHistoryRow[]> {
  return db
    .selectFrom('itemPriceHistory')
    .select([
      'id',
      'itemId',
      'priceType',
      'oldValuePaisa',
      'newValuePaisa',
      'changedAt',
      'sourceType',
      'sourceId',
    ])
    .where('tenantId', '=', tenantId)
    .where('itemId', '=', itemId)
    .orderBy('changedAt', 'desc')
    .execute();
}
