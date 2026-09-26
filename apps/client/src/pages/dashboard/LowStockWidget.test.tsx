// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    item: {
      lowStockCount: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { LowStockWidget } from './LowStockWidget.js';

const lowStockCount = vi.mocked(ipc.item.lowStockCount);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// P17-2 (docs/phases/PHASE_17.md §2.2/§8, S17-DASH-1).
describe('LowStockWidget', () => {
  it('shows the count from a mocked IPC response', async () => {
    lowStockCount.mockResolvedValue(3);

    render(<LowStockWidget onNavigateToItems={() => {}} />);

    expect(await screen.findByText('3')).toBeTruthy();
    expect(screen.getByText(/items low on stock/)).toBeTruthy();
  });

  it('singular wording for exactly 1', async () => {
    lowStockCount.mockResolvedValue(1);

    render(<LowStockWidget onNavigateToItems={() => {}} />);

    expect(await screen.findByText(/item low on stock/)).toBeTruthy();
  });

  it('clicking the count navigates to Items', async () => {
    lowStockCount.mockResolvedValue(2);
    const onNavigateToItems = vi.fn();

    render(<LowStockWidget onNavigateToItems={onNavigateToItems} />);

    const button = await screen.findByRole('button');
    fireEvent.click(button);

    expect(onNavigateToItems).toHaveBeenCalledTimes(1);
  });

  it('shows an error state when the IPC call fails, never crashes', async () => {
    lowStockCount.mockRejectedValue(new Error('boom'));

    render(<LowStockWidget onNavigateToItems={() => {}} />);

    expect(await screen.findByText('Unable to load')).toBeTruthy();
  });
});
