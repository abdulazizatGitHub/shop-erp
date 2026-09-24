// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    commission: {
      listAll: vi.fn(),
      getDetail: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      reverse: vi.fn(),
    },
    staff: {
      listStaff: vi.fn(),
    },
  },
}));

import type { ClaimSummaryDto } from '@shop/contracts';
import { ipc } from '../../../lib/ipc.js';
import { CommissionApprovalsTab } from './CommissionApprovalsTab.js';

const listAll = vi.mocked(ipc.commission.listAll);

const CLAIMS: readonly ClaimSummaryDto[] = [
  {
    claimId: 'claim1',
    jobId: 'job1',
    jobDocNo: 'JOB-0001',
    customerName: 'Ahmad',
    serviceChargeName: 'AC Installation',
    labourAmountPaisa: 300000,
    suggestedAmountPaisa: 50000,
    suggestedRecipientPartyId: 'tech1',
    commissionMode: 'fixed',
    commissionAmountPaisa: 50000,
    commissionBp: null,
    status: 'pending',
    latestDecisionId: null,
    latestDecisionTotalPaisa: null,
    latestDecisionReason: null,
  },
  {
    claimId: 'claim2',
    jobId: 'job2',
    jobDocNo: 'JOB-0002',
    customerName: 'Bilal Fridge Works',
    serviceChargeName: 'Compressor Replacement Labour',
    labourAmountPaisa: 400000,
    suggestedAmountPaisa: 40000,
    suggestedRecipientPartyId: 'tech2',
    commissionMode: 'bp',
    commissionAmountPaisa: null,
    commissionBp: 1000,
    status: 'approved',
    latestDecisionId: 'decision1',
    latestDecisionTotalPaisa: 40000,
    latestDecisionReason: null,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CommissionApprovalsTab (P16-3b)', () => {
  it('lists pending and decided claims, with the basis text and pending total in the header', async () => {
    listAll.mockResolvedValue(CLAIMS);

    render(<CommissionApprovalsTab />);

    await waitFor(() => {
      expect(screen.getByText('JOB-0001')).toBeTruthy();
    });
    expect(screen.getByText('JOB-0002')).toBeTruthy();
    // Rs 500 fixed (claim1) and 10% of Rs 4,000 (claim2, FIX-C2 snapshot basis).
    expect(screen.getByText(/Rs 500 fixed/)).toBeTruthy();
    expect(screen.getByText(/10% of Rs 4,000/)).toBeTruthy();
    // Header: 1 pending claim, Rs 500 suggested total.
    expect(screen.getByText('Pending: 1')).toBeTruthy();
    expect(screen.getByText(/Rs 500 suggested/)).toBeTruthy();
    // Decided claim shows its approved total, not just the word "approved".
    expect(screen.getByText(/Approved: Rs 400/)).toBeTruthy();
  });

  it('shows an empty state when there are no claims at all', async () => {
    listAll.mockResolvedValue([]);

    render(<CommissionApprovalsTab />);

    await waitFor(() => {
      expect(screen.getByText('No commission claims yet')).toBeTruthy();
    });
  });
});
