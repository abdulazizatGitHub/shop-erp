import type { Kysely } from 'kysely';
import { formatDocNumber, newId } from '@shop/shared';
import type {
  CustomerBalanceImportLookups,
  ItemImportLookups,
  NewCustomerBalanceRecord,
  NewItemImportRecord,
  NewOpeningStockRecord,
  NewSupplierBalanceRecord,
  OpeningStockImportLookups,
  SupplierBalanceImportLookups,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const ITEM_CODE_DOC_TYPE = 'item';
const ITEM_CODE_PREFIX = 'ITM';
const normalize = (value: string): string => value.trim().toLowerCase();

export interface InsertedImportItem {
  readonly id: string;
  readonly itemCode: string;
}

/**
 * Bulk import operations — separate from KyselyItemRepository because the
 * field set and transaction shape differ (a whole sheet at a time, wider
 * fields, no per-row atomicity requirement the way a single manual create
 * has). Item-code generation is duplicated from KyselyItemRepository
 * (~15 lines) rather than shared — noted as a consolidation candidate,
 * not worth the abstraction yet at two call sites.
 */
export class KyselyImportRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  async getItemImportLookups(): Promise<ItemImportLookups> {
    const [businessUnits, uoms, categories, brands, items] = await Promise.all([
      this.db
        .selectFrom('businessUnit')
        .select(['id', 'code'])
        .where('tenantId', '=', this.tenantId)
        .execute(),
      this.db
        .selectFrom('uom')
        .select(['id', 'name'])
        .where('tenantId', '=', this.tenantId)
        .execute(),
      this.db
        .selectFrom('category')
        .select(['id', 'name'])
        .where('tenantId', '=', this.tenantId)
        .where('deletedAt', 'is', null)
        .execute(),
      this.db
        .selectFrom('brand')
        .select(['id', 'name'])
        .where('tenantId', '=', this.tenantId)
        .where('deletedAt', 'is', null)
        .execute(),
      this.db
        .selectFrom('item')
        .select(['itemCode', 'nameEn'])
        .where('tenantId', '=', this.tenantId)
        .execute(),
    ]);

    return {
      businessUnitIdByCode: new Map(businessUnits.map((b) => [b.code, b.id])),
      uomIdByName: new Map(uoms.map((u) => [normalize(u.name), u.id])),
      categoryIdByName: new Map(categories.map((c) => [normalize(c.name), c.id])),
      brandIdByName: new Map(brands.map((b) => [normalize(b.name), b.id])),
      existingItemNames: new Set(items.map((i) => normalize(i.nameEn))),
      existingItemCodes: new Set(items.map((i) => i.itemCode)),
    };
  }

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

  async insertImportedItems(
    records: readonly NewItemImportRecord[],
  ): Promise<readonly InsertedImportItem[]> {
    if (records.length === 0) return [];

    return this.db.transaction().execute(async (trx) => {
      const priceLevel = await trx
        .selectFrom('priceLevel')
        .select('id')
        .where('tenantId', '=', this.tenantId)
        .where('isDefault', '=', 1)
        .executeTakeFirst();
      if (!priceLevel) {
        throw new Error('No default price level found — has P1-0 seed run?');
      }

      const results: InsertedImportItem[] = [];
      for (const record of records) {
        const itemCode = record.itemCode ?? (await this.nextItemCode(trx));
        const id = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('item')
          .values({
            id,
            tenantId: this.tenantId,
            itemCode,
            nameEn: record.nameEn,
            nameUr: record.nameUr,
            categoryId: record.categoryId,
            brandId: record.brandId,
            variantLabel: record.variantLabel,
            businessUnitId: record.businessUnitId,
            stockUomId: record.stockUomId,
            purchaseUomId: record.purchaseUomId,
            purchaseToStockFactor: record.purchaseToStockFactorMilli,
            itemType: 'goods',
            trackStock: record.trackStock ? 1 : 0,
            isSerialized: record.isSerialized ? 1 : 0,
            isReturnableContainer: 0,
            lastPurchaseCost: record.costPerStockUnitPaisa,
            avgCost: record.costPerStockUnitPaisa,
            reorderLevel: record.lowStockAlertQtyMilli,
            shelfLocation: record.shelfLocation,
            defaultTaxRate: 0,
            isActive: 1,
            notes: record.notes,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .execute();

        await trx
          .insertInto('itemPrice')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            itemId: id,
            priceLevelId: priceLevel.id,
            price: record.retailPricePaisa,
            effectiveFrom: now,
            createdAt: now,
          })
          .execute();

        results.push({ id, itemCode });
      }
      return results;
    });
  }

  async getOpeningStockLookups(): Promise<OpeningStockImportLookups> {
    const [items, opened] = await Promise.all([
      this.db
        .selectFrom('item')
        .select(['id', 'nameEn', 'stockUomId'])
        .where('tenantId', '=', this.tenantId)
        .execute(),
      this.db
        .selectFrom('stockMovement')
        .select('itemId')
        .where('tenantId', '=', this.tenantId)
        .where('movementType', '=', 'opening')
        .execute(),
    ]);

    return {
      itemByNormalizedName: new Map(
        items.map((i) => [normalize(i.nameEn), { id: i.id, stockUomId: i.stockUomId }]),
      ),
      itemIdsAlreadyOpened: new Set(opened.map((o) => o.itemId)),
    };
  }

  async getDefaultWarehouseId(): Promise<string> {
    const row = await this.db
      .selectFrom('warehouse')
      .select('id')
      .where('tenantId', '=', this.tenantId)
      .where('isDefault', '=', 1)
      .executeTakeFirst();
    if (!row) throw new Error('No default warehouse found — has P1-0 seed run?');
    return row.id;
  }

  async insertOpeningStockMovements(
    records: readonly NewOpeningStockRecord[],
    warehouseId: string,
  ): Promise<void> {
    if (records.length === 0) return;
    const now = new Date().toISOString();
    await this.db
      .insertInto('stockMovement')
      .values(
        records.map((r) => ({
          id: newId(),
          tenantId: this.tenantId,
          itemId: r.itemId,
          warehouseId,
          movementDate: r.movementDate,
          movementType: 'opening',
          quantity: r.quantityMilli,
          unitCost: r.unitCostPaisa,
          serialId: null,
          sourceType: null,
          sourceId: null,
          reason: null,
          reversedById: null,
          createdAt: now,
          createdBy: null,
          businessUnitId: null,
        })),
      )
      .execute();
  }

  async getSupplierBalanceLookups(): Promise<SupplierBalanceImportLookups> {
    const [suppliers, existingBills] = await Promise.all([
      this.db
        .selectFrom('party')
        .select(['id', 'name'])
        .where('tenantId', '=', this.tenantId)
        .where('partyType', '=', 'supplier')
        .where('deletedAt', 'is', null)
        .execute(),
      this.db
        .selectFrom('partyLedger')
        .select(['partyId', 'billReference'])
        .where('tenantId', '=', this.tenantId)
        .where('entryType', '=', 'opening_balance')
        .where('billReference', 'is not', null)
        .execute(),
    ]);

    return {
      supplierIdByNormalizedName: new Map(suppliers.map((s) => [normalize(s.name), s.id])),
      existingBillKeys: new Set(
        existingBills
          .filter((b): b is { partyId: string; billReference: string } => b.billReference !== null)
          .map((b) => `${b.partyId}|${b.billReference}`),
      ),
    };
  }

  async insertSupplierOpeningBalances(records: readonly NewSupplierBalanceRecord[]): Promise<void> {
    if (records.length === 0) return;
    const now = new Date().toISOString();
    await this.db
      .insertInto('partyLedger')
      .values(
        records.map((r) => ({
          id: newId(),
          tenantId: this.tenantId,
          partyId: r.partyId,
          entryDate: r.entryDate,
          entryType: 'opening_balance',
          amount: r.amountPaisa,
          runningNote: null,
          sourceType: null,
          sourceId: null,
          reversedById: null,
          createdAt: now,
          createdBy: null,
          billReference: r.billReference,
          dueDate: r.dueDate,
          billNotes: r.billNotes,
        })),
      )
      .execute();
  }

  async getCustomerBalanceLookups(): Promise<CustomerBalanceImportLookups> {
    const [customers, existingBills] = await Promise.all([
      this.db
        .selectFrom('party')
        .select(['id', 'name'])
        .where('tenantId', '=', this.tenantId)
        .where('partyType', '=', 'customer')
        .where('deletedAt', 'is', null)
        .execute(),
      this.db
        .selectFrom('partyLedger')
        .select(['partyId', 'billReference'])
        .where('tenantId', '=', this.tenantId)
        .where('entryType', '=', 'opening_balance')
        .where('billReference', 'is not', null)
        .execute(),
    ]);

    return {
      customerIdByNormalizedName: new Map(customers.map((c) => [normalize(c.name), c.id])),
      existingBillKeys: new Set(
        existingBills
          .filter((b): b is { partyId: string; billReference: string } => b.billReference !== null)
          .map((b) => `${b.partyId}|${b.billReference}`),
      ),
    };
  }

  /**
   * Unlike insertSupplierOpeningBalances, this re-checks each record
   * against the DB before inserting (SELECT before INSERT) rather than
   * trusting the caller's pre-fetched lookups alone — the idempotency
   * guarantee must hold at the DB layer, not just in the pure validation
   * pass, per P3-4's explicit requirement. Wrapped in withRetry per
   * PROJECT.md BUG-15; one transaction for the whole commit call.
   */
  async insertCustomerOpeningBalances(records: readonly NewCustomerBalanceRecord[]): Promise<void> {
    if (records.length === 0) return;

    await withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        for (const record of records) {
          const existing = await trx
            .selectFrom('partyLedger')
            .select('id')
            .where('tenantId', '=', this.tenantId)
            .where('partyId', '=', record.partyId)
            .where('entryType', '=', 'opening_balance')
            .where('billReference', '=', record.billReference)
            .executeTakeFirst();
          if (existing) continue;

          const now = new Date().toISOString();
          await trx
            .insertInto('partyLedger')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              partyId: record.partyId,
              entryDate: record.entryDate,
              entryType: 'opening_balance',
              amount: record.amountPaisa,
              runningNote: null,
              sourceType: 'import',
              sourceId: record.billReference,
              reversedById: null,
              createdAt: now,
              createdBy: null,
              billReference: record.billReference,
              dueDate: null,
              billNotes: record.billNotes,
            })
            .execute();
        }
      }),
    );
  }
}
