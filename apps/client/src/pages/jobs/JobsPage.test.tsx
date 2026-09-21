// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    job: {
      list: vi.fn().mockResolvedValue([]),
      listTechnicians: vi.fn().mockResolvedValue([]),
    },
    customer: {
      get: vi.fn().mockResolvedValue(null),
    },
    invoice: {
      printSaleInvoice: vi.fn().mockResolvedValue({ printError: null }),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import JobsPage from './JobsPage.js';

const jobList = vi.mocked(ipc.job.list);
const printSaleInvoice = vi.mocked(ipc.invoice.printSaleInvoice);

afterEach(cleanup);

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const BASE_JOB = {
  id: 'job-1',
  docNo: 'JOB-0001',
  customerId: null,
  customerNameAdhoc: 'Ahmad Fridge Repairs',
  jobClientId: null,
  jobClientName: null,
  jobClientPhone: null,
  jobType: 'in_shop',
  status: 'in_progress' as const,
  receivedDate: '2026-09-01',
  assignedTo: null,
  applianceType: 'AC',
  applianceBrand: 'Gree',
  reportedFault: 'Not cooling',
  diagnosedFault: null,
  promisedDate: null,
  createdAt: daysAgoIso(1),
  saleId: null,
};

describe('JobsPage (P6-8 smoke test)', () => {
  it('renders the header and an empty state once job:list resolves with no jobs', async () => {
    render(<JobsPage />);

    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(await screen.findByText('No jobs found.')).toBeTruthy();
  });
});

describe('JobsPage (P14-7 — overdue/stale indicators)', () => {
  it('shows the overdue red dot for a job with promisedDate = yesterday, without opening the job card', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    jobList.mockResolvedValueOnce([{ ...BASE_JOB, promisedDate: yesterday }]);

    render(<JobsPage />);

    const dot = await screen.findByLabelText('Overdue');
    expect(dot).toBeTruthy();
    // Still on the list — no navigation happened just from rendering the indicator.
    expect(screen.getByText('Jobs')).toBeTruthy();
  });

  it('shows the amber stale clock for a job with no promisedDate, created 15 days ago, non-terminal status', async () => {
    jobList.mockResolvedValueOnce([
      { ...BASE_JOB, promisedDate: null, createdAt: daysAgoIso(15), status: 'received' },
    ]);

    render(<JobsPage />);

    expect(
      await screen.findByLabelText('Stale — no promised date, over 14 days since intake'),
    ).toBeTruthy();
  });

  it('does NOT show the overdue dot for a delivered job even with promisedDate = yesterday', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    jobList.mockResolvedValueOnce([{ ...BASE_JOB, promisedDate: yesterday, status: 'delivered' }]);

    render(<JobsPage />);
    await screen.findByText('JOB-0001');
    expect(screen.queryByLabelText('Overdue')).toBeNull();
  });
});

describe('JobsPage (P14-7 — search)', () => {
  it('finds a job by job number, and shows empty state for text matching nothing', async () => {
    jobList.mockResolvedValue([BASE_JOB]);

    render(<JobsPage />);
    await screen.findByText('JOB-0001');

    const search = screen.getByLabelText('Search jobs');
    fireEvent.change(search, { target: { value: 'JOB-0001' } });
    expect(screen.getByText('JOB-0001')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'nonexistent-xyz' } });
    expect(await screen.findByText('No jobs found.')).toBeTruthy();
  });
});

describe('JobsPage (P14-7 — print icon)', () => {
  it('clicking the print icon on a delivered job calls invoice:printSaleInvoice with saleId, and does not open the job card', async () => {
    jobList.mockResolvedValueOnce([{ ...BASE_JOB, status: 'delivered', saleId: 'sale-123' }]);

    render(<JobsPage />);
    const printButton = await screen.findByLabelText('Print invoice');
    fireEvent.click(printButton);

    expect(printSaleInvoice).toHaveBeenCalledWith('sale-123');
    // Job detail page would show a "Job delivered" banner + back link;
    // confirm we're still on the list view (job card was NOT opened).
    expect(screen.getByText('Jobs')).toBeTruthy();
  });
});
