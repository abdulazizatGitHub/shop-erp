// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Covers both AppRoot's own setup.status check and (once it decides
// 'app') everything App.tsx's default Sales tab mounts unconditionally
// — same mock set as App.test.tsx, which renders the identical tree.
vi.mock('../lib/ipc.js', () => ({
  ipc: {
    setup: {
      status: vi.fn(),
    },
    item: {
      lookups: vi.fn().mockResolvedValue({ businessUnits: [], uoms: [], categories: [] }),
      topSelling: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      lowStockCount: vi.fn().mockResolvedValue(0),
      notStockedCount: vi.fn().mockResolvedValue(0),
    },
    setting: {
      getNegativeStockPolicy: vi.fn().mockResolvedValue('warn'),
      getDiscountConfig: vi.fn().mockResolvedValue({
        applyToWalkin: false,
        applyToWholesale: false,
        pkrEnabled: false,
        pkrPresets: [],
        pctEnabled: false,
        pctPresets: [],
      }),
      getShopName: vi.fn().mockResolvedValue('Test Shop'),
      getShopIdentity: vi.fn().mockResolvedValue({ name: 'Test Shop', address: null, phone: null }),
      getRowsPerPage: vi.fn().mockResolvedValue(10),
    },
    cashSession: {
      today: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { ipc } from '../lib/ipc.js';
import { AppRoot } from './AppRoot.js';

const status = vi.mocked(ipc.setup.status);

afterEach(cleanup);

describe('AppRoot', () => {
  it('no tenant row: shows the setup wizard, never mounts the main app', async () => {
    status.mockResolvedValue({ tenantExists: false });

    render(<AppRoot />);

    expect(await screen.findByText("Welcome — let's set up your shop")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sales · Alt+1' })).toBeNull();
  });

  it('tenant row exists: skips the wizard, mounts the main app', async () => {
    status.mockResolvedValue({ tenantExists: true });

    render(<AppRoot />);

    expect(await screen.findByRole('button', { name: 'Sales · Alt+1' })).toBeTruthy();
    expect(screen.queryByText("Welcome — let's set up your shop")).toBeNull();
  });

  it('if the status check itself fails, falls through to the main app rather than trapping an existing shop behind an unreachable wizard', async () => {
    status.mockRejectedValue(new Error('ipc down'));

    render(<AppRoot />);

    expect(await screen.findByRole('button', { name: 'Sales · Alt+1' })).toBeTruthy();
  });
});
