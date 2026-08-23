import { Money, Qty } from '@shop/shared';
import type { ParsedCsvRow } from './csv.js';
import { BUSINESS_UNIT_LABEL_TO_CODE } from './item-columns.js';

export interface ItemImportLookups {
  /** business unit CODE ('PARTS'/'REPAIR') -> id */
  readonly businessUnitIdByCode: ReadonlyMap<string, string>;
  /** normalized (trim+lowercase) uom name -> id */
  readonly uomIdByName: ReadonlyMap<string, string>;
  /** normalized (trim+lowercase) category name -> id */
  readonly categoryIdByName: ReadonlyMap<string, string>;
  /** normalized (trim+lowercase) brand name -> id */
  readonly brandIdByName: ReadonlyMap<string, string>;
  /** item codes already in the DB or already accepted earlier in this run */
  readonly existingItemCodes: ReadonlySet<string>;
}

export interface NewItemImportRecord {
  readonly itemCode: string | null;
  readonly nameEn: string;
  readonly nameUr: string | null;
  readonly businessUnitId: string;
  readonly categoryId: string | null;
  readonly brandId: string | null;
  readonly variantLabel: string | null;
  readonly stockUomId: string;
  readonly purchaseUomId: string | null;
  readonly purchaseToStockFactorMilli: number;
  readonly trackStock: boolean;
  readonly isSerialized: boolean;
  /** paisa, per stock unit — already converted from the sheet's
   * per-purchase-unit price via purchaseToStockFactorMilli. */
  readonly costPerStockUnitPaisa: number | null;
  readonly retailPricePaisa: number;
  readonly lowStockAlertQtyMilli: number | null;
  readonly shelfLocation: string | null;
  readonly notes: string | null;
}

export interface ItemImportAccepted {
  readonly rowNumber: number;
  readonly status: 'accepted';
  readonly record: NewItemImportRecord;
}
export interface ItemImportRejected {
  readonly rowNumber: number;
  readonly status: 'rejected';
  readonly reason: string;
}
export type ItemImportRowResult = ItemImportAccepted | ItemImportRejected;

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Converts a per-purchase-unit price into per-stock-unit cost.
 * purchaseToStockFactorMilli = milli-stock-units per ONE purchase unit
 * (e.g. 13600 milli-kg per cylinder). This is the exact conversion that,
 * done wrong, silently mis-costs every sale of that item.
 */
export function computeCostPerStockUnitPaisa(
  purchasePricePaisaPerPurchaseUnit: number,
  purchaseToStockFactorMilli: number,
): number {
  return Math.round((purchasePricePaisaPerPurchaseUnit * 1000) / purchaseToStockFactorMilli);
}

function parseYesNo(raw: string, fieldName: string, defaultValue: boolean): boolean | string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return defaultValue;
  const upper = trimmed.toUpperCase();
  if (upper === 'Y') return true;
  if (upper === 'N') return false;
  return `${fieldName} must be Y or N, got "${raw}"`;
}

function parseOptionalMoney(raw: string, fieldName: string): number | null | string {
  if (raw.trim().length === 0) return null;
  try {
    const paisa = Money.fromRupees(raw);
    if (paisa < 0) return `${fieldName} cannot be negative`;
    return paisa;
  } catch {
    return `${fieldName} is not a valid amount: "${raw}"`;
  }
}

function validateRow(row: ParsedCsvRow, lookups: ItemImportLookups): ItemImportRowResult {
  const c = row.cells;
  const nameEn = (c['Item Name (English)'] ?? '').trim();
  if (nameEn.length === 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: 'Item Name (English) is required',
    };
  }

  const businessUnitLabel = (c['Owning Business Unit'] ?? '').trim();
  const businessUnitCode = BUSINESS_UNIT_LABEL_TO_CODE.get(businessUnitLabel);
  if (!businessUnitCode) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `Owning Business Unit "${businessUnitLabel}" is not recognised (expected "Spare Parts" or "Repair")`,
    };
  }
  const businessUnitId = lookups.businessUnitIdByCode.get(businessUnitCode);
  if (!businessUnitId) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `Business unit ${businessUnitCode} does not exist in this tenant — has P1-0 seed run?`,
    };
  }

  const sellingUnitRaw = (c['Selling Unit'] ?? '').trim();
  const stockUomId = lookups.uomIdByName.get(normalize(sellingUnitRaw));
  if (sellingUnitRaw.length === 0 || !stockUomId) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `Selling Unit "${sellingUnitRaw}" not found`,
    };
  }

  let categoryId: string | null = null;
  const categoryRaw = (c['Category'] ?? '').trim();
  if (categoryRaw.length > 0) {
    const found = lookups.categoryIdByName.get(normalize(categoryRaw));
    if (!found) {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: `Category "${categoryRaw}" not found`,
      };
    }
    categoryId = found;
  }

  let brandId: string | null = null;
  const brandRaw = (c['Brand / Company'] ?? '').trim();
  if (brandRaw.length > 0) {
    const found = lookups.brandIdByName.get(normalize(brandRaw));
    if (!found) {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: `Brand "${brandRaw}" not found`,
      };
    }
    brandId = found;
  }

  const purchaseUnitRaw = (c['Purchase Unit'] ?? '').trim();
  const unitsPerPurchaseUnitRaw = (c['Units per Purchase Unit'] ?? '').trim();
  let purchaseUomId: string | null = null;
  let purchaseToStockFactorMilli = 1000; // 1:1 default when there's no separate purchase unit
  if (purchaseUnitRaw.length > 0 || unitsPerPurchaseUnitRaw.length > 0) {
    if (purchaseUnitRaw.length === 0 || unitsPerPurchaseUnitRaw.length === 0) {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: 'Purchase Unit and Units per Purchase Unit must both be given, or both left blank',
      };
    }
    const found = lookups.uomIdByName.get(normalize(purchaseUnitRaw));
    if (!found) {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: `Purchase Unit "${purchaseUnitRaw}" not found`,
      };
    }
    purchaseUomId = found;
    const factorUnits = Number(unitsPerPurchaseUnitRaw);
    if (!Number.isFinite(factorUnits) || factorUnits <= 0) {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: `Units per Purchase Unit is not a positive number: "${unitsPerPurchaseUnitRaw}"`,
      };
    }
    purchaseToStockFactorMilli = Qty.fromUnits(factorUnits);
  }

  const trackStock = parseYesNo(c['Track Stock? (Y/N)'] ?? '', 'Track Stock? (Y/N)', true);
  if (typeof trackStock === 'string') {
    return { rowNumber: row.rowNumber, status: 'rejected', reason: trackStock };
  }
  const isSerialized = parseYesNo(c['Has Serial No? (Y/N)'] ?? '', 'Has Serial No? (Y/N)', false);
  if (typeof isSerialized === 'string') {
    return { rowNumber: row.rowNumber, status: 'rejected', reason: isSerialized };
  }

  const purchasePriceResult = parseOptionalMoney(
    c['Purchase Price (PKR)'] ?? '',
    'Purchase Price (PKR)',
  );
  if (typeof purchasePriceResult === 'string') {
    return { rowNumber: row.rowNumber, status: 'rejected', reason: purchasePriceResult };
  }

  const retailPriceRaw = c['Retail Price (PKR)'] ?? '';
  if (retailPriceRaw.trim().length === 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: 'Retail Price (PKR) is required',
    };
  }
  const retailPriceResult = parseOptionalMoney(retailPriceRaw, 'Retail Price (PKR)');
  if (typeof retailPriceResult === 'string') {
    return { rowNumber: row.rowNumber, status: 'rejected', reason: retailPriceResult };
  }
  const retailPricePaisa = retailPriceResult as number;

  const lowStockRaw = (c['Low Stock Alert Qty'] ?? '').trim();
  let lowStockAlertQtyMilli: number | null = null;
  if (lowStockRaw.length > 0) {
    const qty = Number(lowStockRaw);
    if (!Number.isFinite(qty) || qty < 0) {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: `Low Stock Alert Qty is not a valid number: "${lowStockRaw}"`,
      };
    }
    lowStockAlertQtyMilli = Qty.fromUnits(qty);
  }

  const itemCodeRaw = (c['Item Code'] ?? '').trim();
  const itemCode = itemCodeRaw.length > 0 ? itemCodeRaw : null;
  if (itemCode && lookups.existingItemCodes.has(itemCode)) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `Item Code "${itemCode}" already exists`,
    };
  }

  const costPerStockUnitPaisa =
    purchasePriceResult !== null
      ? computeCostPerStockUnitPaisa(purchasePriceResult, purchaseToStockFactorMilli)
      : null;

  return {
    rowNumber: row.rowNumber,
    status: 'accepted',
    record: {
      itemCode,
      nameEn,
      nameUr: (c['Item Name (Urdu)'] ?? '').trim() || null,
      businessUnitId,
      categoryId,
      brandId,
      variantLabel: (c['Variant / Spec'] ?? '').trim() || null,
      stockUomId,
      purchaseUomId,
      purchaseToStockFactorMilli,
      trackStock,
      isSerialized,
      costPerStockUnitPaisa,
      retailPricePaisa,
      lowStockAlertQtyMilli,
      shelfLocation: (c['Shelf / Location'] ?? '').trim() || null,
      notes: (c['Notes'] ?? '').trim() || null,
    },
  };
}

/**
 * Validates and transforms Items sheet rows. Pure — no db, no fs. Rows
 * that reuse an item code already used earlier in the same batch are
 * rejected too (existingItemCodes must be updated by the caller between
 * batches if that matters; within one call, only the DB-known set is
 * checked, matching "no duplicate item codes" against real data).
 */
export function validateItemRows(
  rows: readonly ParsedCsvRow[],
  lookups: ItemImportLookups,
): ItemImportRowResult[] {
  const seenCodes = new Set(lookups.existingItemCodes);
  const results: ItemImportRowResult[] = [];
  for (const row of rows) {
    const result = validateRow(row, { ...lookups, existingItemCodes: seenCodes });
    results.push(result);
    if (result.status === 'accepted' && result.record.itemCode) {
      seenCodes.add(result.record.itemCode);
    }
  }
  return results;
}
