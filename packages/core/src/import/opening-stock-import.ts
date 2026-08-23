import { Money, Qty } from '@shop/shared';
import type { ParsedCsvRow } from './csv.js';

export interface OpeningStockItemLookup {
  readonly id: string;
  readonly stockUomId: string;
}

export interface OpeningStockImportLookups {
  /** normalized (trim+lowercase) Item Name (English) -> item */
  readonly itemByNormalizedName: ReadonlyMap<string, OpeningStockItemLookup>;
  /** item ids that already have an 'opening' stock_movement posted */
  readonly itemIdsAlreadyOpened: ReadonlySet<string>;
}

export interface NewOpeningStockRecord {
  readonly itemId: string;
  readonly quantityMilli: number;
  readonly unitCostPaisa: number | null;
  readonly movementDate: string;
}

export interface OpeningStockAccepted {
  readonly rowNumber: number;
  readonly status: 'accepted';
  readonly record: NewOpeningStockRecord;
}
export interface OpeningStockSkipped {
  readonly rowNumber: number;
  readonly status: 'skipped';
  readonly reason: string;
}
export interface OpeningStockRejected {
  readonly rowNumber: number;
  readonly status: 'rejected';
  readonly reason: string;
}
export type OpeningStockRowResult =
  OpeningStockAccepted | OpeningStockSkipped | OpeningStockRejected;

const normalize = (value: string): string => value.trim().toLowerCase();

function parseDate(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return new Date().toISOString();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function validateRow(row: ParsedCsvRow, lookups: OpeningStockImportLookups): OpeningStockRowResult {
  const c = row.cells;
  const nameRaw = c['Item Name (English)'] ?? '';
  const nameNormalized = normalize(nameRaw);
  const item = lookups.itemByNormalizedName.get(nameNormalized);

  if (nameRaw.trim().length === 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: 'Item Name (English) is required',
    };
  }
  if (!item) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `No item found matching name "${nameRaw.trim()}"`,
    };
  }

  if (lookups.itemIdsAlreadyOpened.has(item.id)) {
    return {
      rowNumber: row.rowNumber,
      status: 'skipped',
      reason: `Opening stock already posted for "${nameRaw.trim()}" — not duplicated`,
    };
  }

  const qtyRaw = (c['Quantity Counted'] ?? '').trim();
  if (qtyRaw.length === 0) {
    return { rowNumber: row.rowNumber, status: 'rejected', reason: 'Quantity Counted is required' };
  }
  const qtyUnits = Number(qtyRaw);
  if (!Number.isFinite(qtyUnits) || qtyUnits < 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `Quantity Counted is not a valid non-negative number: "${qtyRaw}"`,
    };
  }

  const costRaw = (c['Unit Cost (PKR)'] ?? '').trim();
  let unitCostPaisa: number | null = null;
  if (costRaw.length > 0) {
    try {
      unitCostPaisa = Money.fromRupees(costRaw);
    } catch {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: `Unit Cost (PKR) is not a valid amount: "${costRaw}"`,
      };
    }
  }

  return {
    rowNumber: row.rowNumber,
    status: 'accepted',
    record: {
      itemId: item.id,
      quantityMilli: Qty.fromUnits(qtyUnits),
      unitCostPaisa,
      movementDate: parseDate(c['Count Date'] ?? ''),
    },
  };
}

/** Validates and transforms Opening Stock rows. Pure — no db, no fs. */
export function validateOpeningStockRows(
  rows: readonly ParsedCsvRow[],
  lookups: OpeningStockImportLookups,
): OpeningStockRowResult[] {
  return rows.map((row) => validateRow(row, lookups));
}
