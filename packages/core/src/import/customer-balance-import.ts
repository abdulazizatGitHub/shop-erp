import { Money } from '@shop/shared';
import type { ParsedCsvRow } from './csv.js';

export interface CustomerBalanceImportLookups {
  /** normalized (trim+lowercase) customer name -> party id */
  readonly customerIdByNormalizedName: ReadonlyMap<string, string>;
  /** `${partyId}|${billReference}` for bills already imported — idempotency key */
  readonly existingBillKeys: ReadonlySet<string>;
}

export interface NewCustomerBalanceRecord {
  readonly partyId: string;
  readonly entryDate: string;
  /** paisa, always positive — CF-2's sign convention (+ve = customer owes
   * shop more), the same shape as a credit sale. */
  readonly amountPaisa: number;
  readonly billReference: string;
  readonly billNotes: string | null;
}

export interface CustomerBalanceAccepted {
  readonly rowNumber: number;
  readonly status: 'accepted';
  readonly record: NewCustomerBalanceRecord;
}
export interface CustomerBalanceRejected {
  readonly rowNumber: number;
  readonly status: 'rejected';
  readonly reason: string;
}
export interface CustomerBalanceSkipped {
  readonly rowNumber: number;
  readonly status: 'skipped';
  readonly reason: string;
}
export type CustomerBalanceRowResult =
  CustomerBalanceAccepted | CustomerBalanceRejected | CustomerBalanceSkipped;

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
  lookups: CustomerBalanceImportLookups,
): CustomerBalanceRowResult {
  const c = row.cells;

  const nameRaw = (c['Customer Name'] ?? '').trim();
  if (nameRaw.length === 0) {
    return { rowNumber: row.rowNumber, status: 'rejected', reason: 'Customer Name is required' };
  }
  const partyId = lookups.customerIdByNormalizedName.get(normalize(nameRaw));
  if (!partyId) {
    return {
      rowNumber: row.rowNumber,
      status: 'rejected',
      reason: `No customer found matching name "${nameRaw}"`,
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

  // Positive = customer owes the shop more (CF-2). Original and Paid are
  // each converted PKR->paisa independently via Money.fromRupees (the one
  // permitted float step — a decimal-rupees parse), then subtracted as
  // plain integers — never a single combined float expression.
  const amountPaisa = originalPaisa - paidPaisa;
  if (amountPaisa <= 0) {
    return {
      rowNumber: row.rowNumber,
      status: 'skipped',
      reason: `Bill "${billReference}" is already settled (Paid >= Original) — nothing to post`,
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
      billNotes: (c['Notes'] ?? '').trim() || null,
    },
  };
}

/** Validates and transforms Customer Opening Balance rows. Pure — no db, no fs. */
export function validateCustomerBalanceRows(
  rows: readonly ParsedCsvRow[],
  lookups: CustomerBalanceImportLookups,
): CustomerBalanceRowResult[] {
  const seenKeys = new Set(lookups.existingBillKeys);
  const results: CustomerBalanceRowResult[] = [];
  for (const row of rows) {
    const result = validateRow(row, { ...lookups, existingBillKeys: seenKeys });
    results.push(result);
    if (result.status === 'accepted') {
      seenKeys.add(`${result.record.partyId}|${result.record.billReference}`);
    }
  }
  return results;
}
