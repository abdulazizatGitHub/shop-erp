// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@shop/ui';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    item: {
      search: vi.fn().mockResolvedValue([]),
      lookups: vi.fn().mockResolvedValue({ businessUnits: [], uoms: [], categories: [] }),
    },
  },
}));

import { ItemsPage } from './ItemsPage.js';

afterEach(cleanup);

/**
 * P17-2 review round 2, item 3. ItemsPage's own half of the contract:
 * `initialLowStockOnly` seeds the "Low stock only" checkbox at mount —
 * App.tsx (see App.test.tsx) is what decides when that prop is true
 * (the Dashboard widget click) versus omitted/false (every other way of
 * reaching this page).
 */
describe('ItemsPage — initialLowStockOnly', () => {
  it('checkbox starts checked when initialLowStockOnly is true', async () => {
    render(
      <ToastProvider>
        <ItemsPage initialLowStockOnly={true} />
      </ToastProvider>,
    );
    const checkbox = await screen.findByRole<HTMLInputElement>('checkbox', {
      name: 'Low stock only',
    });
    expect(checkbox.checked).toBe(true);
  });

  it('checkbox starts unchecked when the prop is omitted (every non-Dashboard entry point)', async () => {
    render(
      <ToastProvider>
        <ItemsPage />
      </ToastProvider>,
    );
    const checkbox = await screen.findByRole<HTMLInputElement>('checkbox', {
      name: 'Low stock only',
    });
    expect(checkbox.checked).toBe(false);
  });
});
