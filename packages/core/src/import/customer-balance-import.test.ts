import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { CUSTOMER_BALANCE_COLUMNS } from './customer-columns.js';
import {
  validateCustomerBalanceRows,
  type CustomerBalanceImportLookups,
} from './customer-balance-import.js';

const fixturePath = path.join(import.meta.dirname, '__fixtures__/customer_balances.csv');
const ALI_PARTY_ID = 'party-ali';

function baseLookups(): CustomerBalanceImportLookups {
  return {
    customerIdByNormalizedName: new Map([['ali traders', ALI_PARTY_ID]]),
    existingBillKeys: new Set(),
  };
}

describe('validateCustomerBalanceRows against the synthetic fixture', () => {
  const csvText = readFileSync(fixturePath, 'utf8');
  const { rows } = parseCsv(csvText, CUSTOMER_BALANCE_COLUMNS);
  const results = validateCustomerBalanceRows(rows, baseLookups());

  it('parses exactly the 3 fixture rows', () => {
    expect(rows).toHaveLength(3);
  });

  it('accepts the matched row, rejects the unmatched row, skips the already-settled row', () => {
    expect(results.filter((r) => r.status === 'accepted')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'skipped')).toHaveLength(1);
  });

  it('computes amount = Original - Paid (positive = customer owes shop), matches CF-2 sign convention', () => {
    const accepted = results.find((r) => r.status === 'accepted');
    if (accepted?.status !== 'accepted') throw new Error('expected the matched row to be accepted');

    // Fixture: Original 45000, Paid 15000 -> (45000 - 15000) * 100 = 3,000,000 paisa.
    expect(accepted.record.partyId).toBe(ALI_PARTY_ID);
    expect(accepted.record.amountPaisa).toBe(3_000_000);
    expect(accepted.record.billReference).toBe('BILL-001');
    expect(accepted.record.billNotes).toBe('Opening balance from old register');
  });

  it('rejects the unmatched customer name, naming the exact searched string', () => {
    const rejected = results.find((r) => r.status === 'rejected');
    if (rejected?.status !== 'rejected') throw new Error('expected a rejected row');
    expect(rejected.reason).toBe('No customer found matching name "Unknown Shop"');
  });

  it('skips the already-settled row (Paid >= Original) without posting a pointless row', () => {
    const skipped = results.find((r) => r.status === 'skipped');
    if (skipped?.status !== 'skipped') throw new Error('expected a skipped row');
    expect(skipped.reason).toContain('BILL-003');
    expect(skipped.reason).toContain('already settled');
  });

  it('is idempotent on party + bill reference — re-run produces zero new accepted rows', () => {
    const existingBillKeys = new Set([`${ALI_PARTY_ID}|BILL-001`]);
    const secondRun = validateCustomerBalanceRows(rows, { ...baseLookups(), existingBillKeys });

    expect(secondRun.filter((r) => r.status === 'accepted')).toHaveLength(0);
    const skippedBill1 = secondRun.find(
      (r) => r.status === 'skipped' && r.reason.includes('BILL-001'),
    );
    expect(skippedBill1).toBeDefined();
  });

  it('matches customer name case-insensitively after trim', () => {
    const custom = validateCustomerBalanceRows(
      [
        {
          rowNumber: 2,
          cells: {
            'Customer Name': '  ALI traders  ',
            Phone: '',
            'Bill Reference': 'BILL-CASE-TEST',
            'Bill Date': '2026-01-01',
            'Original Amount (PKR)': '1000',
            'Amount Paid So Far (PKR)': '0',
            Notes: '',
          },
        },
      ],
      baseLookups(),
    );
    expect(custom[0]?.status).toBe('accepted');
  });

  it('rejects a missing Bill Reference — it is the idempotency key', () => {
    const custom = validateCustomerBalanceRows(
      [
        {
          rowNumber: 2,
          cells: {
            'Customer Name': 'Ali Traders',
            Phone: '',
            'Bill Reference': '',
            'Bill Date': '2026-01-01',
            'Original Amount (PKR)': '1000',
            'Amount Paid So Far (PKR)': '0',
            Notes: '',
          },
        },
      ],
      baseLookups(),
    );
    expect(custom[0]?.status).toBe('rejected');
  });

  it('rejects an invalid Original Amount', () => {
    const custom = validateCustomerBalanceRows(
      [
        {
          rowNumber: 2,
          cells: {
            'Customer Name': 'Ali Traders',
            Phone: '',
            'Bill Reference': 'BILL-BAD',
            'Bill Date': '2026-01-01',
            'Original Amount (PKR)': 'not-a-number',
            'Amount Paid So Far (PKR)': '0',
            Notes: '',
          },
        },
      ],
      baseLookups(),
    );
    expect(custom[0]?.status).toBe('rejected');
  });
});
