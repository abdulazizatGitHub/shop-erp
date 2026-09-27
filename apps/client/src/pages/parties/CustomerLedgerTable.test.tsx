// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomerLedgerRowDto } from '@shop/contracts';
import { CustomerLedgerTable } from './CustomerLedgerTable.js';

afterEach(() => {
  cleanup();
});

function makeRow(id: string, entryDate: string): CustomerLedgerRowDto {
  return {
    id,
    entryDate,
    entryType: 'sale',
    amountPaisa: 100000,
    runningBalancePaisa: 100000,
    billReference: null,
    billNotes: null,
    sourceType: 'sale',
    sourceId: id,
    saleDocNo: `INV-${id}`,
    saleTotalPaisa: 100000,
    salePaidPaisa: 0,
    saleDiscountPaisa: 0,
    saleStatus: 'confirmed',
    salePaymentMode: 'credit',
    paymentDocNo: null,
    paymentAmountPaisa: null,
    paymentMethod: null,
    paymentReferenceNo: null,
  };
}

const ROWS: readonly CustomerLedgerRowDto[] = Array.from({ length: 12 }, (_, i) =>
  makeRow(`r${String(i + 1)}`, `2026-08-${String(i + 1).padStart(2, '0')}`),
);

/**
 * P17-3 (docs/phases/PHASE_17.md §2.5, §8, Q17-2). No test file existed
 * for this component before this phase — new, per the plan's own
 * "existing report-table tests plus a CustomerLedgerTable render test"
 * wording. Proves the deliberate 15→10 normalization directly: with the
 * old local ROWS_PER_PAGE=15, 12 rows would fit on one page and
 * Pagination would render nothing at all (it returns null when
 * totalRows <= rowsPerPage) — with the shared hook's default of 10, a
 * second page must exist.
 */
describe('CustomerLedgerTable (rows-per-page default, rendered outside any RowsPerPageProvider)', () => {
  it('paginates 12 rows at 10 per page (not the old local 15) — a "Page 2" button exists', () => {
    render(
      <CustomerLedgerTable
        rows={ROWS}
        customerCode="C-0001"
        onSelectSale={vi.fn()}
        onSelectPayment={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Page 2' })).toBeTruthy();
  });

  it('shows exactly 10 rows on page 1', () => {
    render(
      <CustomerLedgerTable
        rows={ROWS}
        customerCode="C-0001"
        onSelectSale={vi.fn()}
        onSelectPayment={vi.fn()}
      />,
    );

    expect(screen.getByText('INV-r1')).toBeTruthy();
    expect(screen.getByText('INV-r10')).toBeTruthy();
    expect(screen.queryByText('INV-r11')).toBeNull();
  });
});
