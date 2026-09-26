// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartLine } from './CartTable.js';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    item: {
      lookups: vi.fn().mockResolvedValue({ businessUnits: [], uoms: [], categories: [] }),
      getPrices: vi.fn().mockResolvedValue({}),
    },
    setting: {
      getDiscountConfig: vi.fn().mockResolvedValue({
        applyToWalkin: false,
        applyToWholesale: false,
        pkrEnabled: false,
        pkrPresets: [],
        pctEnabled: false,
        pctPresets: [],
      }),
      getNegativeStockPolicy: vi.fn().mockResolvedValue('warn'),
    },
    sale: {
      create: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
    print: {
      reprintReceipt: vi.fn(),
    },
    invoice: {
      printSaleInvoice: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { useSaleFlow } from './useSaleFlow.js';

const FAKE_CART: readonly CartLine[] = [
  {
    itemId: 'item-scarce',
    itemLabel: 'Scarce Item',
    quantityMilli: 8000,
    unitPricePaisa: null,
    unitLabel: 'Piece',
  },
];

const NEGATIVE_STOCK_ITEM = {
  itemId: 'item-scarce',
  name: 'Scarce Item',
  onHandMilli: 5000,
  requestedMilli: 8000,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ipc.item.lookups).mockResolvedValue({ businessUnits: [], uoms: [], categories: [] });
  vi.mocked(ipc.setting.getDiscountConfig).mockResolvedValue({
    applyToWalkin: false,
    applyToWholesale: false,
    pkrEnabled: false,
    pkrPresets: [],
    pctEnabled: false,
    pctPresets: [],
  });
  vi.mocked(ipc.setting.getNegativeStockPolicy).mockResolvedValue('warn');
  vi.mocked(ipc.sale.cancel).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * P17-1 review fix (requested item 5). useSaleFlow's Option C state
 * machine, entirely mocked at the ipc.js boundary — proves the hook's
 * own logic (dialog state, resubmit shape, cancel behavior) independent
 * of whatever Electron actually does at the real IPC boundary (covered
 * separately by sale.handler.test.ts and with-error.test.ts).
 */
describe('useSaleFlow — negative-stock confirmation flow (Option C, P17-1)', () => {
  it('confirmation outcome -> negative-stock-gate step with the items populated', async () => {
    vi.mocked(ipc.sale.create).mockResolvedValue({
      negativeStock: 'confirmationRequired',
      items: [NEGATIVE_STOCK_ITEM],
    });

    const { result } = renderHook(() => useSaleFlow());
    await waitFor(() => {
      expect(ipc.setting.getNegativeStockPolicy).toHaveBeenCalled();
    });

    act(() => {
      result.current.setCart(FAKE_CART);
    });
    act(() => {
      result.current.setAmountPaidRupees('1000');
    });

    await act(async () => {
      await result.current.handleCheckout();
    });

    expect(result.current.step).toBe('negative-stock-gate');
    expect(result.current.negativeStockItems).toEqual([NEGATIVE_STOCK_ITEM]);
    // Nothing was ever a "success" — the cart-clearing finishSuccess path
    // must not have run.
    expect(result.current.cart).toEqual(FAKE_CART);
  });

  it('confirm resubmits the IDENTICAL input with acknowledgedNegativeStock: true, then finishes on success', async () => {
    vi.mocked(ipc.sale.create)
      .mockResolvedValueOnce({
        negativeStock: 'confirmationRequired',
        items: [NEGATIVE_STOCK_ITEM],
      })
      .mockResolvedValueOnce({
        id: 'sale-1',
        docNo: 'INV-0001',
        totalAmountPaisa: 1000,
        discountPaisa: 0,
        warnings: { creditLimitExceeded: false, stockBelowZero: true, unitCostMissing: false },
        printError: null,
      });

    const { result } = renderHook(() => useSaleFlow());
    await waitFor(() => {
      expect(ipc.setting.getNegativeStockPolicy).toHaveBeenCalled();
    });

    act(() => {
      result.current.setCart(FAKE_CART);
    });
    act(() => {
      result.current.setAmountPaidRupees('1000');
    });
    await act(async () => {
      await result.current.handleCheckout();
    });
    expect(result.current.step).toBe('negative-stock-gate');

    await act(async () => {
      await result.current.handleConfirmNegativeStock();
    });

    expect(ipc.sale.create).toHaveBeenCalledTimes(2);
    const firstCallInput = vi.mocked(ipc.sale.create).mock.calls[0]?.[0];
    const secondCallInput = vi.mocked(ipc.sale.create).mock.calls[1]?.[0];
    expect(secondCallInput).toEqual({ ...firstCallInput, acknowledgedNegativeStock: true });
    expect(firstCallInput?.acknowledgedNegativeStock).toBe(false);

    // Success path ran — cart cleared, back to search-item.
    expect(result.current.step).toBe('search-item');
    expect(result.current.cart).toEqual([]);
  });

  it('cancel: no resubmit, cart stays intact, back to search-item', async () => {
    vi.mocked(ipc.sale.create).mockResolvedValue({
      negativeStock: 'confirmationRequired',
      items: [NEGATIVE_STOCK_ITEM],
    });

    const { result } = renderHook(() => useSaleFlow());
    await waitFor(() => {
      expect(ipc.setting.getNegativeStockPolicy).toHaveBeenCalled();
    });

    act(() => {
      result.current.setCart(FAKE_CART);
    });
    act(() => {
      result.current.setAmountPaidRupees('1000');
    });
    await act(async () => {
      await result.current.handleCheckout();
    });
    expect(result.current.step).toBe('negative-stock-gate');

    act(() => {
      result.current.handleCancelNegativeStock();
    });

    expect(ipc.sale.create).toHaveBeenCalledTimes(1); // no resubmit
    expect(ipc.sale.cancel).not.toHaveBeenCalled(); // nothing was ever committed to undo
    expect(result.current.step).toBe('search-item');
    expect(result.current.cart).toEqual(FAKE_CART); // cart intact
    expect(result.current.negativeStockItems).toEqual([]);
  });

  it("'blocked' outcome: plain error set, cart intact, no dialog opened", async () => {
    vi.mocked(ipc.sale.create).mockResolvedValue({
      negativeStock: 'blocked',
      items: [NEGATIVE_STOCK_ITEM],
    });

    const { result } = renderHook(() => useSaleFlow());
    await waitFor(() => {
      expect(ipc.setting.getNegativeStockPolicy).toHaveBeenCalled();
    });

    act(() => {
      result.current.setCart(FAKE_CART);
    });
    act(() => {
      result.current.setAmountPaidRupees('1000');
    });
    await act(async () => {
      await result.current.handleCheckout();
    });

    expect(result.current.step).toBe('search-item'); // never opened the gate
    expect(result.current.error).toContain('Scarce Item');
    expect(result.current.cart).toEqual(FAKE_CART); // cart intact — nothing was committed
  });
});
