// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    report: {
      wageMonth: vi.fn(),
    },
    commission: {
      listPending: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { WageMonthReport } from './WageMonthReport.js';

const wageMonth = vi.mocked(ipc.report.wageMonth);
const listPendingClaims = vi.mocked(ipc.commission.listPending);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WageMonthReport (P7-11 smoke test, EC-P7-7/EC-P7-11)', () => {
  it('renders Staff A and Staff B with exact Rs values from the EC-P7-7 scenario', async () => {
    listPendingClaims.mockResolvedValue([]);
    wageMonth.mockResolvedValue([
      {
        staffId: 'a',
        staffName: 'Staff A',
        staffRole: 'technician',
        fullDays: 22,
        halfDays: 2,
        absentDays: 0,
        leaveDays: 0,
        holidayDays: 0,
        grossPaisa: 1_380_000,
        advancesPaisa: 300_000,
        commissionPaisa: 24_000,
        netPaisa: 1_104_000,
      },
      {
        staffId: 'b',
        staffName: 'Staff B',
        staffRole: 'salesman',
        fullDays: 26,
        halfDays: 0,
        absentDays: 0,
        leaveDays: 0,
        holidayDays: 0,
        grossPaisa: 2_080_000,
        advancesPaisa: 0,
        commissionPaisa: 48_000,
        netPaisa: 2_128_000,
      },
    ]);

    render(<WageMonthReport />);

    expect(await screen.findByText('Staff A')).toBeTruthy();
    expect(screen.getByText('Staff B')).toBeTruthy();

    // Staff A: gross=1,380,000 -> Rs 13,800; advances=300,000 -> Rs 3,000;
    // commission=24,000 -> Rs 240; net=1,104,000 -> Rs 11,040.
    expect(screen.getByText('Rs 13,800')).toBeTruthy();
    expect(screen.getByText('Rs 3,000')).toBeTruthy();
    expect(screen.getByText('Rs 240')).toBeTruthy();
    expect(screen.getByText('Rs 11,040')).toBeTruthy();

    // Staff B: gross=2,080,000 -> Rs 20,800; advances=0 -> Rs 0;
    // commission=48,000 -> Rs 480; net=2,128,000 -> Rs 21,280.
    expect(screen.getByText('Rs 20,800')).toBeTruthy();
    expect(screen.getByText('Rs 480')).toBeTruthy();
    expect(screen.getByText('Rs 21,280')).toBeTruthy();
  });

  it('shows an empty state when report:wageMonth returns an empty array', async () => {
    listPendingClaims.mockResolvedValue([]);
    wageMonth.mockResolvedValue([]);

    render(<WageMonthReport />);

    expect(await screen.findByText('No attendance records for this month.')).toBeTruthy();
  });

  it('P16-3b: shows ONE pending-commission total (count + suggested amount) in the header, not split per technician', async () => {
    wageMonth.mockResolvedValue([]);
    listPendingClaims.mockResolvedValue([
      {
        claimId: 'c1',
        jobId: 'j1',
        jobDocNo: 'JOB-0001',
        customerName: 'Ahmad',
        serviceChargeName: 'AC Installation',
        labourAmountPaisa: 300000,
        suggestedAmountPaisa: 50000,
        suggestedRecipientPartyId: null,
        commissionMode: 'fixed',
        commissionAmountPaisa: 50000,
        commissionBp: null,
      },
      {
        claimId: 'c2',
        jobId: 'j2',
        jobDocNo: 'JOB-0002',
        customerName: 'Bilal',
        serviceChargeName: 'Compressor Replacement Labour',
        labourAmountPaisa: 400000,
        suggestedAmountPaisa: 40000,
        suggestedRecipientPartyId: null,
        commissionMode: 'bp',
        commissionAmountPaisa: null,
        commissionBp: 1000,
      },
    ]);

    render(<WageMonthReport />);

    // 2 claims, 50000 + 40000 = 90000 paisa -> Rs 900, shown once, not per technician.
    expect(await screen.findByText(/Pending commission: 2 claims/)).toBeTruthy();
    expect(screen.getByText(/Rs 900 suggested/)).toBeTruthy();
  });

  it('shows no pending-commission line when there are zero pending claims', async () => {
    wageMonth.mockResolvedValue([]);
    listPendingClaims.mockResolvedValue([]);

    render(<WageMonthReport />);

    await screen.findByText('No attendance records for this month.');
    expect(screen.queryByText(/Pending commission/)).toBeNull();
  });
});
