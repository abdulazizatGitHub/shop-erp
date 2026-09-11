import { sql, type Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import type {
  ItemRecord,
  ItemRepositoryPort,
  ItemSearchQuery,
  NewItemInput,
  NewItemResult,
} from '@shop/core';
import type { Database } from '../kysely-schema.js';

const ITEM_CODE_DOC_TYPE = 'item';
const ITEM_CODE_PREFIX = 'ITM';

export class KyselyItemRepository implements ItemRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextItemCode(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', ITEM_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', ITEM_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: ITEM_CODE_DOC_TYPE,
          prefix: ITEM_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(ITEM_CODE_PREFIX, nextNumber);
  }

  async createItem(input: NewItemInput): Promise<NewItemResult> {
    return this.db.transaction().execute(async (trx) => {
      const itemCode = input.itemCode ?? (await this.nextItemCode(trx));
      const id = newId();
      const now = new Date().toISOString();

      await trx
        .insertInto('item')
        .values({
          id,
          tenantId: this.tenantId,
          itemCode,
          nameEn: input.nameEn,
          nameUr: input.nameUr,
          categoryId: null,
          brandId: null,
          variantLabel: null,
          businessUnitId: input.businessUnitId,
          stockUomId: input.stockUomId,
          purchaseUomId: null,
          purchaseToStockFactor: 1000,
          itemType: 'goods',
          trackStock: input.trackStock ? 1 : 0,
          isSerialized: 0,
          isReturnableContainer: 0,
          lastPurchaseCost: null,
          avgCost: null,
          reorderLevel: null,
          shelfLocation: null,
          defaultTaxRate: 0,
          isActive: 1,
          notes: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          altUomId: input.altUomId ?? null,
          altUomFactorMilli: input.altUomFactorMilli ?? null,
        })
        .execute();

      const priceLevel = await trx
        .selectFrom('priceLevel')
        .select('id')
        .where('tenantId', '=', this.tenantId)
        .where('isDefault', '=', 1)
        .executeTakeFirst();
      if (!priceLevel) {
        throw new Error('No default price level found — has P1-0 seed run?');
      }

      await trx
        .insertInto('itemPrice')
        .values({
          id: newId(),
          tenantId: this.tenantId,
          itemId: id,
          priceLevelId: priceLevel.id,
          price: input.retailPricePaisa,
          effectiveFrom: now,
          createdAt: now,
        })
        .execute();

      return { id, itemCode };
    });
  }

  async getItemById(id: string): Promise<ItemRecord | null> {
    const row = await this.db
      .selectFrom('item')
      .leftJoin('itemPrice', (join) =>
        join
          .onRef('itemPrice.itemId', '=', 'item.id')
          .on(
            'itemPrice.priceLevelId',
            '=',
            this.db
              .selectFrom('priceLevel')
              .select('id')
              .where('tenantId', '=', this.tenantId)
              .where('isDefault', '=', 1),
          ),
      )
      .select([
        'item.id',
        'item.itemCode',
        'item.nameEn',
        'item.nameUr',
        'item.businessUnitId',
        'item.stockUomId',
        'item.trackStock',
        'itemPrice.price as retailPricePaisa',
        'item.altUomId',
        'item.altUomFactorMilli',
      ])
      .where('item.id', '=', id)
      .where('item.tenantId', '=', this.tenantId)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      itemCode: row.itemCode,
      nameEn: row.nameEn,
      nameUr: row.nameUr,
      businessUnitId: row.businessUnitId,
      stockUomId: row.stockUomId,
      retailPricePaisa: row.retailPricePaisa,
      trackStock: row.trackStock === 1,
      altUomId: row.altUomId,
      altUomFactorMilli: row.altUomFactorMilli,
      // getItemById has zero callers today (no channel wires it up) — this
      // field is supplied only to satisfy the shared ItemRecord shape, not
      // a real stock lookup for this method.
      stockOnHandMilli: null,
    };
  }

  async searchItems(query: ItemSearchQuery): Promise<readonly ItemRecord[]> {
    let q = this.db
      .selectFrom('item')
      .leftJoin('itemPrice', (join) =>
        join
          .onRef('itemPrice.itemId', '=', 'item.id')
          .on(
            'itemPrice.priceLevelId',
            '=',
            this.db
              .selectFrom('priceLevel')
              .select('id')
              .where('tenantId', '=', this.tenantId)
              .where('isDefault', '=', 1),
          ),
      )
      .select([
        'item.id',
        'item.itemCode',
        'item.nameEn',
        'item.nameUr',
        'item.businessUnitId',
        'item.stockUomId',
        'item.trackStock',
        'itemPrice.price as retailPricePaisa',
        'item.altUomId',
        'item.altUomFactorMilli',
        // Scalar subquery, not a row-level LEFT JOIN: v_stock_on_hand is
        // GROUP BY (tenant_id, item_id, warehouse_id), so a plain JOIN
        // would duplicate rows for any item moved in >1 warehouse. SUM()
        // over zero rows is SQLite NULL — matches "no movements" (no
        // COALESCE). Same aggregate-all-warehouses approach as
        // report.repository.ts's getStockValuationReport.
        sql<
          number | null
        >`(SELECT SUM(qty_milli) FROM v_stock_on_hand WHERE item_id = item.id AND tenant_id = item.tenant_id)`.as(
          'stockOnHandMilli',
        ),
      ])
      .where('item.tenantId', '=', this.tenantId)
      .where('item.deletedAt', 'is', null);

    if (query.query.length > 0) {
      q = q.where('item.nameEn', 'like', `%${query.query}%`);
    }
    if (query.categoryId) {
      q = q.where('item.categoryId', '=', query.categoryId);
    }

    const rows = await q.execute();
    return rows.map((row) => ({
      id: row.id,
      itemCode: row.itemCode,
      nameEn: row.nameEn,
      nameUr: row.nameUr,
      businessUnitId: row.businessUnitId,
      stockUomId: row.stockUomId,
      retailPricePaisa: row.retailPricePaisa,
      trackStock: row.trackStock === 1,
      altUomId: row.altUomId,
      altUomFactorMilli: row.altUomFactorMilli,
      stockOnHandMilli: row.trackStock === 1 ? row.stockOnHandMilli : null,
    }));
  }

  async topSellingItems(limit: number): Promise<readonly ItemRecord[]> {
    // Raw sql — view precedent, same as searchItems above. sale.status =
    // 'confirmed' excludes cancelled sales (cancelSale flips status but
    // never deletes sale_line rows), which an unfiltered SUM would
    // otherwise wrongly count as "sold".
    const result = await sql<{
      id: string;
      itemCode: string;
      nameEn: string;
      nameUr: string | null;
      businessUnitId: string | null;
      stockUomId: string;
      retailPricePaisa: number | null;
      trackStock: number;
      altUomId: string | null;
      altUomFactorMilli: number | null;
      stockOnHandMilli: number | null;
    }>`
      SELECT
        item.id                      AS id,
        item.item_code                AS itemCode,
        item.name_en                  AS nameEn,
        item.name_ur                  AS nameUr,
        item.business_unit_id         AS businessUnitId,
        item.stock_uom_id             AS stockUomId,
        item_price.price               AS retailPricePaisa,
        item.track_stock              AS trackStock,
        item.alt_uom_id               AS altUomId,
        item.alt_uom_factor_milli     AS altUomFactorMilli,
        (SELECT SUM(qty_milli) FROM v_stock_on_hand WHERE item_id = item.id AND tenant_id = item.tenant_id) AS stockOnHandMilli
      FROM sale_line sl
      JOIN sale ON sale.id = sl.sale_id
      JOIN item ON item.id = sl.item_id
      LEFT JOIN item_price ON item_price.item_id = item.id
        AND item_price.price_level_id = (
          SELECT id FROM price_level WHERE tenant_id = ${this.tenantId} AND is_default = 1
        )
      WHERE sl.tenant_id = ${this.tenantId}
        AND sl.item_id IS NOT NULL
        AND sale.status = 'confirmed'
        AND item.is_active = 1
        AND item.deleted_at IS NULL
      GROUP BY sl.item_id
      ORDER BY SUM(sl.quantity) DESC
      LIMIT ${limit}
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      itemCode: row.itemCode,
      nameEn: row.nameEn,
      nameUr: row.nameUr,
      businessUnitId: row.businessUnitId,
      stockUomId: row.stockUomId,
      retailPricePaisa: row.retailPricePaisa,
      trackStock: row.trackStock === 1,
      altUomId: row.altUomId,
      altUomFactorMilli: row.altUomFactorMilli,
      stockOnHandMilli: row.trackStock === 1 ? row.stockOnHandMilli : null,
    }));
  }
}
