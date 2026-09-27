// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Only the ipc surface actually touched at mount by the tabs this test
// visits (Sales — the app's default tab, Dashboard, Items) — no other
// tab ever mounts in this test, so no other ipc namespace is needed.
vi.mock('../lib/ipc.js', () => ({
  ipc: {
    item: {
      lookups: vi.fn().mockResolvedValue({ businessUnits: [], uoms: [], categories: [] }),
      topSelling: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      lowStockCount: vi.fn().mockResolvedValue(2),
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
      // Sidebar.tsx and ShopIdentityContext.tsx both fetch these
      // unconditionally, regardless of which tab is active — every App
      // render needs them mocked.
      getShopName: vi.fn().mockResolvedValue('Test Shop'),
      getShopIdentity: vi.fn().mockResolvedValue({ name: 'Test Shop', address: null, phone: null }),
      // RowsPerPageProvider (P17-3) also fetches this unconditionally on
      // every App mount, same as the two settings above.
      getRowsPerPage: vi.fn().mockResolvedValue(10),
    },
    cashSession: {
      today: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { App } from './App.js';

afterEach(cleanup);

/**
 * P17-2 review round 2, item 3. The Dashboard low-stock widget's click
 * must open Items with "Low stock only" already ON (Q17-3, as
 * approved) — not just switch tabs and leave the owner to tick the
 * checkbox. Also proves the one-shot flag (App.tsx's
 * itemsInitialLowStockOnly) doesn't leak into a later, unrelated visit
 * to Items via the sidebar.
 */
describe('App — Dashboard low-stock widget navigates to Items with the filter pre-applied', () => {
  it('clicking the widget opens Items with the "Low stock only" checkbox already checked', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    const widgetButton = await screen.findByRole('button', { name: '2 items low on stock' });
    fireEvent.click(widgetButton);

    const checkbox = await screen.findByRole<HTMLInputElement>('checkbox', {
      name: 'Low stock only',
    });
    expect(checkbox.checked).toBe(true);
  });

  it('a later, direct sidebar visit to Items (not via the widget) opens with the checkbox unchecked', async () => {
    render(<App />);

    // Dashboard -> widget click -> Items (checked), same as the test above.
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    const widgetButton = await screen.findByRole('button', { name: '2 items low on stock' });
    fireEvent.click(widgetButton);
    await waitFor(() => {
      const checked = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Low stock only' });
      expect(checked.checked).toBe(true);
    });

    // Leave Items for Sales, then come back to Items directly via the
    // sidebar — the one-shot flag must not still be "on" from before.
    fireEvent.click(screen.getByRole('button', { name: 'Sales · Alt+1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Items · Alt+2' }));

    const checkbox = await screen.findByRole<HTMLInputElement>('checkbox', {
      name: 'Low stock only',
    });
    expect(checkbox.checked).toBe(false);
  });
});
