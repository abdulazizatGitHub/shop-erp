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
      unassignReason: null,
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
    // P16-3b item 5: prefilled with the suggested recipient/amount.
    const staffSelect: HTMLSelectElement = screen.getByLabelText('Staff member');
    const amountInput: HTMLInputElement = screen.getByLabelText('Amount (Rs)');
    expect(staffSelect.value).toBe('tech1');
    expect(amountInput.value).toBe('500');

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

  it('P16-3b item 5: a claim with NO suggested recipient prefills the Approve row empty, not with a stale value', async () => {
    getDetail.mockResolvedValue({ ...PENDING_DETAIL, suggestedRecipientPartyId: null });
    listStaff.mockResolvedValue(STAFF);

    render(<ClaimDetailModal claimId="claim1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(screen.getByLabelText('Staff member')).toBeTruthy();
    });

    const staffSelect: HTMLSelectElement = screen.getByLabelText('Staff member');
    const amountInput: HTMLInputElement = screen.getByLabelText('Amount (Rs)');
    expect(staffSelect.value).toBe('');
    // The suggested AMOUNT still prefills even with no recipient suggestion — only the staff pick is empty.
    expect(amountInput.value).toBe('500');
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

  it('P16-3b item 3: shows the total-vs-suggested difference once the amount is edited away from the suggestion', async () => {
    getDetail.mockResolvedValue(PENDING_DETAIL);
    listStaff.mockResolvedValue(STAFF);

    render(<ClaimDetailModal claimId="claim1" onClose={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(screen.getByLabelText('Amount (Rs)')).toBeTruthy();
    });

    // Suggested is Rs 500 (50000 paisa) — no diff shown yet.
    expect(screen.getByText('Total: Rs 500')).toBeTruthy();
    expect(screen.queryByText(/vs\. suggested/)).toBeNull();

    fireEvent.change(screen.getByLabelText('Amount (Rs)'), { target: { value: '650' } });

    await waitFor(() => {
      expect(screen.getByText(/Total: Rs 650/)).toBeTruthy();
    });
    // +65000 paisa - 50000 suggested = +15000 paisa = +Rs 150.
    expect(screen.getByText(/\+Rs 150 vs\. suggested/)).toBeTruthy();
  });

  it('P16-3b item 3: Rs amounts convert through Money.fromRupees ("300.50" -> 30050 paisa); an invalid amount is blocked with no IPC call', async () => {
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
      expect(screen.getByLabelText('Amount (Rs)')).toBeTruthy();
    });

    // sanitizeMoneyInput strips anything but digits/one dot, so a stray
    // letter never even reaches state; a lone "." survives the sanitizer
    // (it's a valid partial-decimal character) but Money.fromRupees
    // rejects it outright (Number(".") is NaN) — a genuine parse failure.
    fireEvent.change(screen.getByLabelText('Amount (Rs)'), { target: { value: '.' } });
    fireEvent.click(screen.getByText('Confirm approval'));
    await waitFor(() => {
      expect(screen.getByText(/must be a valid Rs amount/)).toBeTruthy();
    });
    expect(approve).not.toHaveBeenCalled();

    // A syntactically valid amount that resolves to zero is a separate
    // guard (amount > 0), not a parse failure — also blocked, no call.
    fireEvent.change(screen.getByLabelText('Amount (Rs)'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Confirm approval'));
    await waitFor(() => {
      expect(screen.getByText(/must be greater than zero/)).toBeTruthy();
    });
    expect(approve).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Amount (Rs)'), { target: { value: '300.50' } });
    fireEvent.click(screen.getByText('Confirm approval'));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [
            { technicianPartyId: 'tech1', amountPaisa: 30050, outsideHistoryReason: null },
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
