import type { Kysely } from 'kysely';
import { formatDocNumber, newId } from '@shop/shared';
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

    return formatDocNumber(ITEM_CODE_PREFIX, this.deviceCode, nextNumber);
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
    }));
  }
}
