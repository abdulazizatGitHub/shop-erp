// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    cashMovement: {
      record: vi.fn(),
      reverse: vi.fn(),
      listForDateRange: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { CashMovementSection } from './CashMovementSection.js';

const listForDateRange = vi.mocked(ipc.cashMovement.listForDateRange);
const record = vi.mocked(ipc.cashMovement.record);
const reverse = vi.mocked(ipc.cashMovement.reverse);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), Task 5/6. Render tests for the
 * "Cash In / Cash Out" UI — note-required-on-submit, the 'other' direction
 * toggle, reversal wiring, and the ADR-0016 §5 no-auth warning.
 */
describe('CashMovementSection', () => {
  it('shows the no-auth warning line', async () => {
    listForDateRange.mockResolvedValue([]);

    render(<CashMovementSection sessionDate="2026-08-15" />);

    expect(
      await screen.findByText('Movements are not tied to a login until the auth phase.'),
    ).toBeTruthy();
  });

  it('disables Record until a note is entered', async () => {
    listForDateRange.mockResolvedValue([]);

    render(<CashMovementSection sessionDate="2026-08-15" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cash In / Cash Out' }));
    fireEvent.change(screen.getByLabelText('Amount (Rs)'), { target: { value: '500' } });

    expect(screen.getByRole('button', { name: 'Record' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Deposited at HBL' } });

    expect(screen.getByRole('button', { name: 'Record' }).hasAttribute('disabled')).toBe(false);
  });

  it("shows a Cash In/Cash Out direction toggle only for the 'other' movement type", async () => {
    listForDateRange.mockResolvedValue([]);

    render(<CashMovementSection sessionDate="2026-08-15" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cash In / Cash Out' }));

    expect(screen.queryByText('Cash In')).toBeNull();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'other' } });

    expect(screen.getByText('Cash In')).toBeTruthy();
    expect(screen.getByText('Cash Out')).toBeTruthy();
  });

  it('records a movement and calls ipc.cashMovement.record with a signed amount', async () => {
    listForDateRange.mockResolvedValue([]);
    record.mockResolvedValue({
      id: 'm1',
      docNo: 'CM-0001',
      movementDate: '2026-08-15',
      movementType: 'bank_deposit',
      amountPaisa: -50000,
      note: 'Deposited at HBL',
      reversesId: null,
      createdAt: '2026-08-15T10:00:00.000Z',
    });

    render(<CashMovementSection sessionDate="2026-08-15" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cash In / Cash Out' }));
    fireEvent.change(screen.getByLabelText('Amount (Rs)'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Deposited at HBL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));

    await waitFor(() => {
      expect(record).toHaveBeenCalledWith({
        movementType: 'bank_deposit',
        amountPaisa: -50000,
        note: 'Deposited at HBL',
      });
    });
  });

  it("shows each movement individually with doc_no, description, and note, labelling a reversal as 'Correction of {original doc_no}'", async () => {
    listForDateRange.mockResolvedValue([
      {
        id: 'm1',
        docNo: 'CM-0001',
        movementDate: '2026-08-15',
        movementType: 'bank_deposit',
        amountPaisa: -50000,
        note: 'Deposited at HBL',
        reversesId: null,
        createdAt: '2026-08-15T10:00:00.000Z',
      },
      {
        id: 'm2',
        docNo: 'CM-0002',
        movementDate: '2026-08-15',
        movementType: 'bank_deposit',
        amountPaisa: 50000,
        note: 'Mistaken entry',
        reversesId: 'm1',
        createdAt: '2026-08-15T10:05:00.000Z',
      },
    ]);

    render(<CashMovementSection sessionDate="2026-08-15" />);

    expect(await screen.findByText('CM-0001')).toBeTruthy();
    expect(screen.getByText('CM-0002')).toBeTruthy();
    expect(screen.getByText('Correction of CM-0001')).toBeTruthy();
  });

  it('clicking Reverse calls ipc.cashMovement.reverse with the original id and the entered note', async () => {
    listForDateRange.mockResolvedValue([
      {
        id: 'm1',
        docNo: 'CM-0001',
        movementDate: '2026-08-15',
        movementType: 'bank_deposit',
        amountPaisa: -50000,
        note: 'Deposited at HBL',
        reversesId: null,
        createdAt: '2026-08-15T10:00:00.000Z',
      },
    ]);
    reverse.mockResolvedValue({
      id: 'm2',
      docNo: 'CM-0002',
      movementDate: '2026-08-15',
      movementType: 'bank_deposit',
      amountPaisa: 50000,
      note: 'Data entry mistake',
      reversesId: 'm1',
      createdAt: '2026-08-15T10:05:00.000Z',
    });

    render(<CashMovementSection sessionDate="2026-08-15" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reverse' }));
    fireEvent.change(screen.getByPlaceholderText('Reason for correction'), {
      target: { value: 'Data entry mistake' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(reverse).toHaveBeenCalledWith({ originalId: 'm1', note: 'Data entry mistake' });
    });
  });
});
