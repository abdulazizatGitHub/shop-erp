// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    commission: {
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

import type { ClaimDetailDto, StaffDto } from '@shop/contracts';
import { ipc } from '../../../lib/ipc.js';
import { ClaimDetailModal } from './ClaimDetailModal.js';

const getDetail = vi.mocked(ipc.commission.getDetail);
const approve = vi.mocked(ipc.commission.approve);
const reverse = vi.mocked(ipc.commission.reverse);
const listStaff = vi.mocked(ipc.staff.listStaff);

const STAFF: readonly StaffDto[] = [
  {
    id: 'tech1',
    name: 'Naeem',
    phone: '0300',
    staffRole: 'technician',
    wageRatePaisa: 60000,
    commissionBp: 0,
    partyCode: 'STF-0001',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'tech2',
    name: 'Zafar (senior, not on this job)',
    phone: '0301',
    staffRole: 'technician',
    wageRatePaisa: 70000,
    commissionBp: 0,
    partyCode: 'STF-0002',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

const PENDING_DETAIL: ClaimDetailDto = {
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
  technicianHistory: [
    {
      technicianPartyId: 'tech1',
      technicianName: 'Naeem',
      assignedAt: '2026-09-24T08:00:00.000Z',
      unassignedAt: null,
    },
  ],
  decisions: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ClaimDetailModal (P16-3b)', () => {
  it('a pending claim shows Approve/Reject; approving the prefilled suggested recipient/amount succeeds with no outside-history flag', async () => {
    getDetail.mockResolvedValue(PENDING_DETAIL);
    listStaff.mockResolvedValue(STAFF);
    approve.mockResolvedValue({
      id: 'decision1',
      attemptNo: 1,
      decision: 'approved',
      reason: null,
      decidedAt: '2026-09-25',
      recipients: [],
      reversal: null,
    });
    const onChanged = vi.fn();

    render(<ClaimDetailModal claimId="claim1" onClose={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeTruthy();
    });
    // No outside-history flag for the prefilled in-history recipient.
    expect(screen.queryByText(/Not on this job's technician list/)).toBeNull();

    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(screen.getByText('Confirm approval')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Confirm approval'));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({
          claimId: 'claim1',
          recipients: [
            { technicianPartyId: 'tech1', amountPaisa: 50000, outsideHistoryReason: null },
          ],
        }),
      );
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('selecting a recipient NOT in the technician history flags it and blocks approval until a reason is given', async () => {
    getDetail.mockResolvedValue(PENDING_DETAIL);
    listStaff.mockResolvedValue(STAFF);
    approve.mockResolvedValue({
      id: 'decision1',
      attemptNo: 1,
      decision: 'approved',
      reason: null,
      decidedAt: '2026-09-25',
      recipients: [],
      reversal: null,
    });

    render(<ClaimDetailModal claimId="claim1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(screen.getByLabelText('Staff member')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Staff member'), { target: { value: 'tech2' } });
    await waitFor(() => {
      expect(screen.getByText(/Not on this job's technician list/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Confirm approval'));
    await waitFor(() => {
      expect(screen.getByText(/needs a reason/)).toBeTruthy();
    });
    expect(approve).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reason (required)'), {
      target: { value: 'Senior technician covered for Naeem' },
    });
    fireEvent.click(screen.getByText('Confirm approval'));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [
            {
              technicianPartyId: 'tech2',
              amountPaisa: 50000,
              outsideHistoryReason: 'Senior technician covered for Naeem',
            },
          ],
        }),
      );
    });
  });

  it('a decided claim shows a Reverse action requiring a reason', async () => {
    getDetail.mockResolvedValue({
      ...PENDING_DETAIL,
      decisions: [
        {
          id: 'decision1',
          attemptNo: 1,
          decision: 'approved',
          reason: null,
          decidedAt: '2026-09-25',
          recipients: [
            {
              technicianPartyId: 'tech1',
              technicianName: 'Naeem',
              amountPaisa: 50000,
              outsideHistoryReason: null,
            },
          ],
          reversal: null,
        },
      ],
    });
    listStaff.mockResolvedValue(STAFF);
    reverse.mockResolvedValue(undefined);
    const onChanged = vi.fn();

    render(<ClaimDetailModal claimId="claim1" onClose={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => {
      expect(screen.getByText('Reverse')).toBeTruthy();
    });
    expect(screen.queryByText('Approve')).toBeNull();

    fireEvent.click(screen.getByText('Reverse'));
    await waitFor(() => {
      expect(screen.getByText('Confirm reverse')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Confirm reverse'));
    await waitFor(() => {
      expect(screen.getByText(/A reason is required/)).toBeTruthy();
    });
    expect(reverse).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reversal reason (required)'), {
      target: { value: 'Wrong technician selected' },
    });
    fireEvent.click(screen.getByText('Confirm reverse'));

    await waitFor(() => {
      expect(reverse).toHaveBeenCalledWith(
        expect.objectContaining({ decisionId: 'decision1', reason: 'Wrong technician selected' }),
      );
    });
    expect(onChanged).toHaveBeenCalled();
  });
});
