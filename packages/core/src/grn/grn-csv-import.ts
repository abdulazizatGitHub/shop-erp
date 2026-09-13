import { parseCsvLine, type ParsedCsvRow } from '../import/csv.js';

/** P9C. Exact contract — case-sensitive, exact names, exact order. */
export const GRN_CSV_COLUMNS = [
  'Item Code',
  'Qty Received',
  'Unit Cost (Rs)',
  'Selling Price (Rs)',
  'Wholesale Price (Rs)',
  'Notes',
] as const;

export interface GrnCsvItemLookup {
  readonly id: string;
  readonly itemCode: string;
}

/** One line of the PO this CSV is being imported against. */
export interface PoLineForCsvImport {
  readonly purchaseOrderLineId: string;
  readonly itemId: string;
  readonly orderedMilli: number;
  readonly alreadyReceivedMilli: number;
}

export interface ValidatedGrnRow {
  readonly rowNumber: number;
  readonly itemId: string;
  readonly purchaseOrderLineId: string;
  readonly quantityReceivedMilli: number;
  readonly unitCostPaisa: number;
  readonly sellingPricePaisa: number;
  readonly wholesalePricePaisa: number | null;
  readonly notes: string | null;
}

export interface RejectedGrnRow {
  readonly rowNumber: number;
  readonly itemCode: string | null;
  readonly reason: string;
}

export interface GrnCsvValidationResult {
  readonly accepted: readonly ValidatedGrnRow[];
  readonly rejected: readonly RejectedGrnRow[];
}

export type ParseGrnCsvResult =
  | { readonly ok: true; readonly rows: readonly ParsedCsvRow[] }
  | { readonly ok: false; readonly fileError: string };

/**
 * File-level checks only: exact header (case-sensitive, exact names, exact
 * order — stricter than packages/core/src/import/csv.ts's parseCsv, which
 * fuzzy-matches by name regardless of order; that leniency is wrong for
 * this contract, so this is a dedicated parser, not a reuse of parseCsv)
 * and at least one data row. Row-level validation is validateGrnCsvRows.
 */
export function parseGrnCsv(text: string): ParseGrnCsvResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, fileError: 'The file is empty.' };
  }

  const headerCells = parseCsvLine(lines[0] ?? '').map((h) => h.trim());
  const headerMatches =
    headerCells.length === GRN_CSV_COLUMNS.length &&
    headerCells.every((h, i) => h === GRN_CSV_COLUMNS[i]);
  if (!headerMatches) {
    return {
      ok: false,
      fileError: `Header row must be exactly: ${GRN_CSV_COLUMNS.join(', ')}`,
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    return { ok: false, fileError: 'The file has no data rows.' };
  }

  const rows: ParsedCsvRow[] = dataLines.map((line, index) => {
    const values = parseCsvLine(line);
    const cells: Record<string, string> = {};
    GRN_CSV_COLUMNS.forEach((header, i) => {
      cells[header] = (values[i] ?? '').trim();
    });
    // 1-based, not counting the header row (index 0 -> row 1).
    return { rowNumber: index + 1, cells };
  });

  return { ok: true, rows };
}

/** Returns the paisa value, or an error string if raw is blank/non-numeric/<=0. */
function parsePositiveMoney(raw: string, fieldName: string): number | string {
  if (raw.trim().length === 0) return `${fieldName} is required`;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return `${fieldName} must be a positive number`;
  // e.g. "350.50" Rs -> Math.round(350.50 * 100) = 35050 paisa
  return Math.round(n * 100);
}

/** Returns the milli-units value, or an error string if raw is blank/non-numeric/<=0. */
function parseQtyReceived(raw: string): number | string {
  if (raw.trim().length === 0) return 'Qty Received is required';
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 'Qty Received must be a positive number';
  // e.g. "13.6" kg -> Math.round(13.6 * 1000) = 13600 milli-units
  return Math.round(n * 1000);
}

type RowOutcome =
  | { readonly kind: 'accepted'; readonly record: ValidatedGrnRow }
  | { readonly kind: 'rejected'; readonly record: RejectedGrnRow };

function validateRow(
  row: ParsedCsvRow,
  poLinesByItemId: ReadonlyMap<string, PoLineForCsvImport>,
  itemsByCode: ReadonlyMap<string, GrnCsvItemLookup>,
  /** purchaseOrderLineId -> remaining milli left in THIS file, decremented as rows are accepted — so a second row for the same item is checked against what's actually left, not the PO's original remaining. */
  remainingByLine: Map<string, number>,
): RowOutcome {
  const c = row.cells;
  const itemCodeRaw = (c['Item Code'] ?? '').trim();
  if (itemCodeRaw.length === 0) {
    return {
      kind: 'rejected',
      record: { rowNumber: row.rowNumber, itemCode: null, reason: 'Item Code is required' },
    };
  }

  const item = itemsByCode.get(itemCodeRaw);
  if (!item) {
    return {
      kind: 'rejected',
      record: {
        rowNumber: row.rowNumber,
        itemCode: itemCodeRaw,
        reason: `Item ${itemCodeRaw} does not exist`,
      },
    };
  }

  const poLine = poLinesByItemId.get(item.id);
  if (!poLine) {
    return {
      kind: 'rejected',
      record: {
        rowNumber: row.rowNumber,
        itemCode: itemCodeRaw,
        reason: `Item ${itemCodeRaw} is not on this purchase order`,
      },
    };
  }

  const qtyResult = parseQtyReceived(c['Qty Received'] ?? '');
  if (typeof qtyResult === 'string') {
    return {
      kind: 'rejected',
      record: { rowNumber: row.rowNumber, itemCode: itemCodeRaw, reason: qtyResult },
    };
  }
  const quantityReceivedMilli = qtyResult;

  const remainingMilli =
    remainingByLine.get(poLine.purchaseOrderLineId) ??
    poLine.orderedMilli - poLine.alreadyReceivedMilli;
  if (quantityReceivedMilli > remainingMilli) {
    const qtyUnits = (quantityReceivedMilli / 1000).toString();
    const remainingUnits = (remainingMilli / 1000).toString();
    return {
      kind: 'rejected',
      record: {
        rowNumber: row.rowNumber,
        itemCode: itemCodeRaw,
        reason: `Qty received (${qtyUnits}) exceeds remaining qty (${remainingUnits}) for ${itemCodeRaw}`,
      },
    };
  }

  const unitCostResult = parsePositiveMoney(c['Unit Cost (Rs)'] ?? '', 'Unit Cost (Rs)');
  if (typeof unitCostResult === 'string') {
    return {
      kind: 'rejected',
      record: { rowNumber: row.rowNumber, itemCode: itemCodeRaw, reason: unitCostResult },
    };
  }

  const sellingPriceResult = parsePositiveMoney(
    c['Selling Price (Rs)'] ?? '',
    'Selling Price (Rs)',
  );
  if (typeof sellingPriceResult === 'string') {
    return {
      kind: 'rejected',
      record: { rowNumber: row.rowNumber, itemCode: itemCodeRaw, reason: sellingPriceResult },
    };
  }

  const wholesaleRaw = (c['Wholesale Price (Rs)'] ?? '').trim();
  let wholesalePricePaisa: number | null = null;
  if (wholesaleRaw.length > 0) {
    const n = Number.parseFloat(wholesaleRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return {
        kind: 'rejected',
        record: {
          rowNumber: row.rowNumber,
          itemCode: itemCodeRaw,
          reason: 'Wholesale Price (Rs) must be a positive number',
        },
      };
    }
    // e.g. "420.00" Rs -> Math.round(420.00 * 100) = 42000 paisa
    wholesalePricePaisa = Math.round(n * 100);
  }

  const notesRaw = (c['Notes'] ?? '').trim();
  if (notesRaw.length > 200) {
    return {
      kind: 'rejected',
      record: {
        rowNumber: row.rowNumber,
        itemCode: itemCodeRaw,
        reason: 'Notes must be 200 characters or fewer',
      },
    };
  }

  remainingByLine.set(poLine.purchaseOrderLineId, remainingMilli - quantityReceivedMilli);

  return {
    kind: 'accepted',
    record: {
      rowNumber: row.rowNumber,
      itemId: item.id,
      purchaseOrderLineId: poLine.purchaseOrderLineId,
      quantityReceivedMilli,
      unitCostPaisa: unitCostResult,
      sellingPricePaisa: sellingPriceResult,
      wholesalePricePaisa,
      notes: notesRaw.length > 0 ? notesRaw : null,
    },
  };
}

/**
 * Validates and transforms GRN CSV rows against a specific purchase order.
 * Pure — no db, no fs. All paisa/milli conversions happen here, server-side
 * — the client sends only raw CSV strings (see grn-csv-import.handler
 * wiring in grn.handler.ts).
 */
export function validateGrnCsvRows(
  rows: readonly ParsedCsvRow[],
  poLines: readonly PoLineForCsvImport[],
  itemsByCode: ReadonlyMap<string, GrnCsvItemLookup>,
): GrnCsvValidationResult {
  const poLinesByItemId = new Map(poLines.map((l) => [l.itemId, l]));
  const remainingByLine = new Map<string, number>();
  const accepted: ValidatedGrnRow[] = [];
  const rejected: RejectedGrnRow[] = [];

  for (const row of rows) {
    const outcome = validateRow(row, poLinesByItemId, itemsByCode, remainingByLine);
    if (outcome.kind === 'accepted') {
      accepted.push(outcome.record);
    } else {
      rejected.push(outcome.record);
    }
  }

  return { accepted, rejected };
}
