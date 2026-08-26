import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { SUPPLIER_BALANCE_COLUMNS } from './supplier-columns.js';
import {
  validateSupplierBalanceRows,
  type SupplierBalanceImportLookups,
} from './supplier-balance-import.js';

const fixturePath = path.join(import.meta.dirname, '__fixtures__/supplier_balances.csv');
const METRO_PARTY_ID = 'party-metro';

function baseLookups(): SupplierBalanceImportLookups {
  return {
    supplierIdByNormalizedName: new Map([['metro refrigeration traders', METRO_PARTY_ID]]),
    existingBillKeys: new Set(),
  };
}

describe('validateSupplierBalanceRows against the synthetic fixture', () => {
  const csvText = readFileSync(fixturePath, 'utf8');
  const { rows } = parseCsv(csvText, SUPPLIER_BALANCE_COLUMNS);
  const results = validateSupplierBalanceRows(rows, baseLookups());

  it('parses exactly the 3 fixture rows', () => {
    expect(rows).toHaveLength(3);
  });

  it('accepts the matched row, rejects the unmatched row, skips the zero-balance row', () => {
    expect(results.filter((r) => r.status === 'accepted')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'skipped')).toHaveLength(1);
  });

  it('computes amount = Paid - Original (negative = shop owes supplier), writes bill metadata verbatim', () => {
    const accepted = results.find((r) => r.status === 'accepted');
    if (accepted?.status !== 'accepted') throw new Error('expected the matched row to be accepted');

    // Fixture: Original 45000, Paid 15000 -> amount = (15000 - 45000) * 100 = -3,000,000 paisa.
    expect(accepted.record.partyId).toBe(METRO_PARTY_ID);
    expect(accepted.record.amountPaisa).toBe(-3_000_000);
    expect(accepted.record.billReference).toBe('BILL-2024-001');
    expect(accepted.record.dueDate).toBe('2026-02-15');
    expect(accepted.record.billNotes).toBe('Compressor stock opening balance');
  });

  it('rejects the unmatched supplier name, naming the exact searched string', () => {
    const rejected = results.find((r) => r.status === 'rejected');
    if (rejected?.status !== 'rejected') throw new Error('expected a rejected row');
    expect(rejected.reason).toBe('No supplier found matching name "Nonexistent Supplier XYZ"');
  });

  it('skips the zero-balance row (Original = Paid) without posting a pointless zero row', () => {
    const skipped = results.find((r) => r.status === 'skipped');
    if (skipped?.status !== 'skipped') throw new Error('expected a skipped row');
    expect(skipped.reason).toContain('BILL-2024-002');
    expect(skipped.reason).toContain('zero balance');
  });

  it('is idempotent on party + bill reference — re-run produces zero new accepted rows', () => {
    const existingBillKeys = new Set([`${METRO_PARTY_ID}|BILL-2024-001`]);
    const secondRun = validateSupplierBalanceRows(rows, { ...baseLookups(), existingBillKeys });

    expect(secondRun.filter((r) => r.status === 'accepted')).toHaveLength(0);
    const skippedBill1 = secondRun.find(
      (r) => r.status === 'skipped' && r.reason.includes('BILL-2024-001'),
    );
    expect(skippedBill1).toBeDefined();
  });

  it('matches supplier name case-insensitively after trim', () => {
    const custom = validateSupplierBalanceRows(
      [
        {
          rowNumber: 2,
          cells: {
            'Supplier Name': '  METRO refrigeration TRADERS  ',
            Phone: '',
            'Bill Reference': 'BILL-CASE-TEST',
            'Bill Date': '2026-01-01',
            'Original Amount (PKR)': '1000',
            'Amount Paid So Far (PKR)': '0',
            'Due Date': '',
            Notes: '',
          },
        },
      ],
      baseLookups(),
    );
    expect(custom[0]?.status).toBe('accepted');
  });

  it('rejects a missing Bill Reference — it is the idempotency key', () => {
    const custom = validateSupplierBalanceRows(
      [
        {
          rowNumber: 2,
          cells: {
            'Supplier Name': 'Metro Refrigeration Traders',
            Phone: '',
            'Bill Reference': '',
            'Bill Date': '2026-01-01',
            'Original Amount (PKR)': '1000',
            'Amount Paid So Far (PKR)': '0',
            'Due Date': '',
            Notes: '',
          },
        },
      ],
      baseLookups(),
    );
    expect(custom[0]?.status).toBe('rejected');
  });

  it('rejects an invalid Original Amount', () => {
    const custom = validateSupplierBalanceRows(
      [
        {
          rowNumber: 2,
          cells: {
            'Supplier Name': 'Metro Refrigeration Traders',
            Phone: '',
            'Bill Reference': 'BILL-BAD',
            'Bill Date': '2026-01-01',
            'Original Amount (PKR)': 'not-a-number',
            'Amount Paid So Far (PKR)': '0',
            'Due Date': '',
            Notes: '',
          },
        },
      ],
      baseLookups(),
    );
    expect(custom[0]?.status).toBe('rejected');
  });
});
