// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    cashSession: {
      today: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { CashSessionWidget } from './CashSessionWidget.js';

const today = vi.mocked(ipc.cashSession.today);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Over by', { exact: false })).toBeTruthy();
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
    });

    render(<CashSessionWidget />);

    expect(await screen.findByText('Short by', { exact: false })).toBeTruthy();
  });
});
