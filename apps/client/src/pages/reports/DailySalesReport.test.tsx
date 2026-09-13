// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    report: {
      dailySales: vi.fn(),
    },
    sale: {
      listByDate: vi.fn(),
    },
    customer: {
      get: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { DailySalesReport } from './DailySalesReport.js';

const dailySales = vi.mocked(ipc.report.dailySales);
const listByDate = vi.mocked(ipc.sale.listByDate);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DailySalesReport — Export CSV button (P10-5)', () => {
  it('is disabled while data is loading, before either IPC call resolves', () => {
    // Promises that never resolve during this test — sales/summary stay null.
    dailySales.mockReturnValue(new Promise(() => {}));
    listByDate.mockReturnValue(new Promise(() => {}));

    render(<DailySalesReport />);

    const button = screen.getByRole('button', { name: 'Export CSV' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('is disabled when the sales array is empty', async () => {
    dailySales.mockResolvedValue([]);
    listByDate.mockResolvedValue([]);

    render(<DailySalesReport />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Export CSV' });
      expect(button.hasAttribute('disabled')).toBe(true);
    });
  });

  it('is enabled when the sales array has at least one row', async () => {
    dailySales.mockResolvedValue([
      {
        date: '2026-09-13',
        invoiceCount: 1,
        totalSalesPaisa: 100000,
        cashCollectedPaisa: 100000,
        creditGivenPaisa: 0,
      },
    ]);
    listByDate.mockResolvedValue([
      {
        id: 'sale-1',
        docNo: 'INV-A-000001',
        customerId: null,
        saleDate: '2026-09-13',
        paymentMode: 'cash',
        totalAmountPaisa: 100000,
        paidAmountPaisa: 100000,
        status: 'confirmed',
      },
    ]);

    render(<DailySalesReport />);

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Export CSV' });
      expect(button.hasAttribute('disabled')).toBe(false);
    });
  });
});
