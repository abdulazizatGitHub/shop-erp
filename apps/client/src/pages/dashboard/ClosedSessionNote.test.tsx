// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    cashSession: {
      setNote: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { ClosedSessionNote } from './ClosedSessionNote.js';

const setNote = vi.mocked(ipc.cashSession.setNote);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), review round 7 follow-up.
 */
describe('ClosedSessionNote', () => {
  it('shows "Add note" with no existing note, and saves via ipc.cashSession.setNote', async () => {
    setNote.mockResolvedValue({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: '2026-08-15T20:00:00.000Z',
      openingCash: 500000,
      expectedCash: 4500000,
      countedCash: 4500000,
      difference: 0,
      status: 'closed',
      notes: 'Deposited float surplus at HBL',
    });
    const onSaved = vi.fn();

    render(<ClosedSessionNote sessionId="s1" note={null} onSaved={onSaved} />);

    expect(screen.getByRole('button', { name: 'Add note' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Deposited float surplus at HBL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setNote).toHaveBeenCalledWith({
        sessionId: 's1',
        note: 'Deposited float surplus at HBL',
      });
    });
    expect(onSaved).toHaveBeenCalledWith('Deposited float surplus at HBL');
  });

  it('disables Save until a note is entered', () => {
    render(<ClosedSessionNote sessionId="s1" note={null} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows "Edit note" and the existing note text when a note already exists', () => {
    render(
      <ClosedSessionNote
        sessionId="s1"
        note="Owner took Rs 2,000 to the bank."
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText('Owner took Rs 2,000 to the bank.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeTruthy();
  });

  it('a second save replaces the note rather than appending (idempotent update)', async () => {
    setNote.mockResolvedValueOnce({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: '2026-08-15T20:00:00.000Z',
      openingCash: 500000,
      expectedCash: 4500000,
      countedCash: 4500000,
      difference: 0,
      status: 'closed',
      notes: 'Second, corrected note',
    });

    render(<ClosedSessionNote sessionId="s1" note="First note" onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Second, corrected note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setNote).toHaveBeenCalledWith({ sessionId: 's1', note: 'Second, corrected note' });
    });
    expect(setNote).toHaveBeenCalledTimes(1);
  });
});
