// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: { cashSession: { today: vi.fn() } },
}));

import { ipc } from '../../lib/ipc.js';
import { useCashSessionNotice } from './useCashSessionNotice.js';

const today = vi.mocked(ipc.cashSession.today);

/** Minimal probe — renders the hook's two outputs so they can be asserted. */
function Probe(): React.JSX.Element {
  const { showNoCashSessionNotice, dismissNoCashSessionNotice } = useCashSessionNotice();
  return (
    <div>
      <span data-testid="shown">{showNoCashSessionNotice ? 'yes' : 'no'}</span>
      <button type="button" onClick={dismissNoCashSessionNotice}>
        dismiss
      </button>
    </div>
  );
}

const OPEN_SESSION = {
  id: 'x',
  sessionDate: '2026-10-03',
  status: 'open',
  openingCash: 100000,
  openedAt: new Date().toISOString(),
} as unknown as Awaited<ReturnType<typeof ipc.cashSession.today>>;

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCashSessionNotice', () => {
  it('shows the notice when no session is open', async () => {
    today.mockResolvedValue(null);
    render(<Probe />);
    expect(await screen.findByText('yes')).toBeTruthy();
  });

  it('stays hidden when a session is open', async () => {
    today.mockResolvedValue(OPEN_SESSION);
    render(<Probe />);
    // 'no' is also the pre-resolution state, so waiting for the lookup to
    // settle is what makes this assertion mean anything. Verified by
    // mutation: inverting the hook's `session === null` fails this test.
    await waitFor(() => {
      expect(today).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('shown').textContent).toBe('no');
    });
    expect(screen.getByTestId('shown').textContent).toBe('no');
  });

  it('hides after dismissal', async () => {
    today.mockResolvedValue(null);
    render(<Probe />);
    expect(await screen.findByText('yes')).toBeTruthy();
    screen.getByRole('button', { name: 'dismiss' }).click();
    expect(await screen.findByText('no')).toBeTruthy();
  });

  it('stays hidden when the lookup fails, rather than warning falsely', async () => {
    today.mockRejectedValue(new Error('ipc down'));
    render(<Probe />);
    await waitFor(() => {
      expect(today).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('shown').textContent).toBe('no');
    });
    expect(screen.getByTestId('shown').textContent).toBe('no');
  });
});
