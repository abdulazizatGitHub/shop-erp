// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    cashSession: {
      today: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      setNote: vi.fn(),
    },
    cashMovement: {
      record: vi.fn(),
      reverse: vi.fn(),
      listForDateRange: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { CashSessionWidget } from './CashSessionWidget.js';

const today = vi.mocked(ipc.cashSession.today);
const listForDateRange = vi.mocked(ipc.cashMovement.listForDateRange);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  listForDateRange.mockResolvedValue([]);
});

describe('CashSessionWidget (P7-10 smoke test, EC-P7-10)', () => {
  it('STATE 1 — null: shows "Not started" and an Open Session button', async () => {
    today.mockResolvedValue(null);

    render(<CashSessionWidget />);

    expect(await screen.findByText('Not started')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Session' })).toBeTruthy();
  });

  it('STATE 2 — open: shows opening float and a Close Session button', async () => {
    today.mockResolvedValue({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: null,
      openingCash: 500000,
      expectedCash: null,
      countedCash: null,
      difference: null,
      status: 'open',
      notes: null,
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Rs 5,000')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Session' })).toBeTruthy();
  });

  it('STATE 3 — closed, balanced (difference = 0): shows "Balanced"', async () => {
    today.mockResolvedValue({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: '2026-08-15T20:00:00.000Z',
      openingCash: 500000,
      expectedCash: 4500000,
      countedCash: 4500000,
      difference: 0,
      status: 'closed',
      notes: null,
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Balanced', { exact: false })).toBeTruthy();
  });

  it('STATE 3 — closed, over (difference > 0): shows "Over by"', async () => {
    today.mockResolvedValue({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: '2026-08-15T20:00:00.000Z',
      openingCash: 500000,
      expectedCash: 4420000,
      countedCash: 4500000,
      difference: 80000,
      status: 'closed',
      notes: null,
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Over by', { exact: false })).toBeTruthy();
  });

  // Phase 17.5, review round 4 R8: cashSession:today now resolves the
  // currently-OPEN session (getOpenSession), never strictly "today's" —
  // an older still-open session must render as STATE 2 (open), not
  // STATE 1 ("Not started"), even though its own sessionDate is well
  // before whatever today's wall-clock date is when the test runs.
  it('shows an older still-open session (not "Not started") when one is still open past its own day', async () => {
    today.mockResolvedValue({
      id: 's1',
      sessionDate: '2020-01-01',
      openedAt: '2020-01-01T09:00:00.000Z',
      closedAt: null,
      openingCash: 500000,
      expectedCash: null,
      countedCash: null,
      difference: null,
      status: 'open',
      notes: null,
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Rs 5,000')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close Session' })).toBeTruthy();
    expect(screen.queryByText('Not started')).toBeNull();
    expect(screen.getByText('2020-01-01', { exact: false })).toBeTruthy();
  });

  it('STATE 3 — closed, short (difference < 0): shows "Short by"', async () => {
    today.mockResolvedValue({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: '2026-08-15T20:00:00.000Z',
      openingCash: 500000,
      expectedCash: 4500000,
      countedCash: 4400000,
      difference: -100000,
      status: 'closed',
      notes: null,
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Short by', { exact: false })).toBeTruthy();
  });

  // Review round 7 follow-up (docs/phases/PHASE_17_5.md): the "Add note"
  // control only makes sense once a session's expected_cash is final —
  // it must not appear while the session is still open.
  it('STATE 2 — open: does not show an Add note / Edit note control', async () => {
    today.mockResolvedValue({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: null,
      openingCash: 500000,
      expectedCash: null,
      countedCash: null,
      difference: null,
      status: 'open',
      notes: null,
    });

    render(<CashSessionWidget />);

    await screen.findByText('Rs 5,000');
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit note' })).toBeNull();
  });

  it('STATE 3 — closed with an existing note: shows the note text and an Edit note button', async () => {
    today.mockResolvedValue({
      id: 's1',
      sessionDate: '2026-08-15',
      openedAt: '2026-08-15T09:00:00.000Z',
      closedAt: '2026-08-15T20:00:00.000Z',
      openingCash: 500000,
      expectedCash: 4500000,
      countedCash: 4500000,
      difference: 0,
      status: 'closed',
      notes: 'Owner took Rs 2,000 to the bank.',
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Owner took Rs 2,000 to the bank.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeTruthy();
  });
});
