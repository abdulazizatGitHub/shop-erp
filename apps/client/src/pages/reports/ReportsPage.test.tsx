// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// BUG-2 fix — isolate ReportsPage's own group-filtering logic from the 8
// real child report tabs (each with its own IPC fetching), matching this
// directory's own precedent of mocking dependencies rather than rendering
// real chart-heavy children in a unit test.
vi.mock('./DailySalesReport.js', () => ({ DailySalesReport: () => <div>DailySalesReport</div> }));
vi.mock('./StockValuationReport.js', () => ({
  StockValuationReport: () => <div>StockValuationReport</div>,
}));
vi.mock('./ReceivablesAgingReport.js', () => ({
  ReceivablesAgingReport: () => <div>ReceivablesAgingReport</div>,
}));
vi.mock('./JobsReport.js', () => ({ JobsReport: () => <div>JobsReport</div> }));
vi.mock('./CashBookReport.js', () => ({ CashBookReport: () => <div>CashBookReport</div> }));
vi.mock('./UnitPlReport.js', () => ({ UnitPlReport: () => <div>UnitPlReport</div> }));
vi.mock('./WageMonthReport.js', () => ({ WageMonthReport: () => <div>WageMonthReport</div> }));
vi.mock('./ExpensesReport.js', () => ({ ExpensesReport: () => <div>ExpensesReport</div> }));

import { ReportsPage } from './ReportsPage.js';

afterEach(cleanup);

describe("ReportsPage (BUG-2 fix — only the active group's tabs are shown)", () => {
  it('activeGroup="daily" shows only the 4 Operational tabs, not the Financial ones', () => {
    render(<ReportsPage activeGroup="daily" onActiveGroupChange={() => {}} />);

    expect(screen.getByText('Operational')).toBeTruthy();
    expect(screen.queryByText('Financial')).toBeNull();

    expect(screen.getByRole('tab', { name: 'Sales' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Stock' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Udhaar (Who Owes Me)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Jobs' })).toBeTruthy();

    expect(screen.queryByRole('tab', { name: 'Cash Record' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Business Profit' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Wages' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Expenses' })).toBeNull();
  });

  it('activeGroup="accounts" shows only the 4 Financial tabs, not the Operational ones', () => {
    render(<ReportsPage activeGroup="accounts" onActiveGroupChange={() => {}} />);

    expect(screen.getByText('Financial')).toBeTruthy();
    expect(screen.queryByText('Operational')).toBeNull();

    expect(screen.getByRole('tab', { name: 'Cash Record' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Business Profit' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Wages' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Expenses' })).toBeTruthy();

    expect(screen.queryByRole('tab', { name: 'Sales' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Stock' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Udhaar (Who Owes Me)' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Jobs' })).toBeNull();
  });
});
