import { Money } from '@shop/shared';
import type { ParsedCsvRow } from './csv.js';

export interface SupplierBalanceImportLookups {
  /** normalized (trim+lowercase) supplier name -> party id */
  readonly supplierIdByNormalizedName: ReadonlyMap<string, string>;
  /** `${partyId}|${billReference}` for bills already imported — idempotency key */
  readonly existingBillKeys: ReadonlySet<string>;
}

export interface NewSupplierBalanceRecord {
  readonly partyId: string;
  readonly entryDate: string;
  /** paisa, signed per the schema's convention: negative = the shop owes
   * the supplier more (Original > Paid is the normal case). */
  readonly amountPaisa: number;
  readonly billReference: string;
  readonly dueDate: string | null;
  readonly billNotes: string | null;
}

export interface SupplierBalanceAccepted {
  readonly rowNumber: number;
  readonly status: 'accepted';
  readonly record: NewSupplierBalanceRecord;
}
export interface SupplierBalanceRejected {
  readonly rowNumber: number;
  readonly status: 'rejected';
  readonly reason: string;
}
export interface SupplierBalanceSkipped {
  readonly rowNumber: number;
  readonly status: 'skipped';
  readonly reason: string;
}
export type SupplierBalanceRowResult =
  SupplierBalanceAccepted | SupplierBalanceRejected | SupplierBalanceSkipped;

const normalize = (value: string): string => value.trim().toLowerCase();

function parseDate(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return new Date().toISOString();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function validateRow(
  row: ParsedCsvRow,
  lookups: SupplierBalanceImportLookups,
): SupplierBalanceRowResult {
  const c = row.cells;

  const nameRaw = (c['Supplier Name'] ?? '').trim();
  if (nameRaw.length === 0) {
    return { rowNumber: row.rowNumber, status: 'rejected', reason: 'Supplier Name is required' };
  }
  const partyId = lookups.supplierIdByNormalizedName.get(normalize(nameRaw));
  if (!partyId) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `No supplier found matching name "${nameRaw}"`,
    };
  }

  const billReference = (c['Bill Reference'] ?? '').trim();
  if (billReference.length === 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: 'Bill Reference is required — it is the only stable key for re-import idempotency',
    };
  }
  if (lookups.existingBillKeys.has(`${partyId}|${billReference}`)) {
    return {
      rowNumber: row.rowNumber,
      status: 'skipped',
      reason: `Bill "${billReference}" for "${nameRaw}" already imported — not duplicated`,
    };
  }

  const originalRaw = (c['Original Amount (PKR)'] ?? '').trim();
  if (originalRaw.length === 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: 'Original Amount (PKR) is required',
    };
  }
  let originalPaisa: number;
  try {
    originalPaisa = Money.fromRupees(originalRaw);
  } catch {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `Original Amount (PKR) is not a valid amount: "${originalRaw}"`,
    };
  }
  if (originalPaisa < 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: 'Original Amount (PKR) cannot be negative',
    };
  }

  const paidRaw = (c['Amount Paid So Far (PKR)'] ?? '').trim();
  let paidPaisa = 0;
  if (paidRaw.length > 0) {
    try {
      paidPaisa = Money.fromRupees(paidRaw);
    } catch {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: `Amount Paid So Far (PKR) is not a valid amount: "${paidRaw}"`,
      };
    }
    if (paidPaisa < 0) {
      return {
        rowNumber: row.rowNumber,
        status: 'rejected',
        reason: 'Amount Paid So Far (PKR) cannot be negative',
      };
    }
  }

  const amountPaisa = paidPaisa - originalPaisa; // negative = shop owes supplier more
  if (amountPaisa === 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'skipped',
      reason: `Bill "${billReference}" has zero balance (Original = Paid) — nothing to post`,
    };
  }

  return {
    rowNumber: row.rowNumber,
    status: 'accepted',
    record: {
      partyId,
      entryDate: parseDate(c['Bill Date'] ?? ''),
      amountPaisa,
      billReference,
      dueDate: (c['Due Date'] ?? '').trim() || null,
      billNotes: (c['Notes'] ?? '').trim() || null,
    },
  };
}

/** Validates and transforms Supplier Opening Balance rows. Pure — no db, no fs. */
export function validateSupplierBalanceRows(
  rows: readonly ParsedCsvRow[],
  lookups: SupplierBalanceImportLookups,
): SupplierBalanceRowResult[] {
  const seenKeys = new Set(lookups.existingBillKeys);
  const results: SupplierBalanceRowResult[] = [];
  for (const row of rows) {
    const result = validateRow(row, { ...lookups, existingBillKeys: seenKeys });
    results.push(result);
    if (result.status === 'accepted') {
      seenKeys.add(`${result.record.partyId}|${result.record.billReference}`);
    }
  }
  return results;
}
