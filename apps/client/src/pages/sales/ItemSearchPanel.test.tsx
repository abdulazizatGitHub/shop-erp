// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto } from '@shop/contracts';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    item: {
      topSelling: vi.fn(),
      search: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { ItemSearchPanel } from './ItemSearchPanel.js';

function makeItem(overrides: Partial<ItemDto>): ItemDto {
  return {
    id: 'item-1',
    itemCode: 'ITM-0001',
    nameEn: 'Compressor 1.5 Ton',
    nameUr: null,
    businessUnitId: null,
    stockUomId: 'uom-piece',
    retailPricePaisa: 500000,
    trackStock: true,
    altUomId: null,
    altUomFactorMilli: null,
    stockOnHandMilli: 10000,
    ...overrides,
  };
}

afterEach(cleanup);

describe('ItemSearchPanel — P10-1 zero-stock hard block', () => {
  it('an out-of-stock item (stockOnHandMilli = 0) cannot be selected or confirmed into the cart', async () => {
    const outOfStock = makeItem({
      id: 'item-out',
      nameEn: 'Out Of Stock Item',
      stockOnHandMilli: 0,
    });
    vi.mocked(ipc.item.topSelling).mockResolvedValue([outOfStock]);
    const onConfirmLine = vi.fn();

    render(
      <ItemSearchPanel
        lookups={null}
        uomName={() => 'Piece'}
        onConfirmLine={onConfirmLine}
        onCheckoutTrigger={() => {}}
        onError={() => {}}
      />,
    );

    const card = await screen.findByText('Out Of Stock Item');
    expect(screen.getByText('Out of stock')).toBeTruthy();
    // TextInput always renders type="text" regardless of variant, so the
    // search box itself is already one "textbox" — assert the count stays
    // at 1 (no qty row opened), not that zero textboxes exist.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    // Click: must not open the inline qty row (no way left to confirm).
    fireEvent.click(card.closest('button') ?? card);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(onConfirmLine).not.toHaveBeenCalled();
  });

  it('a stocked item (stockOnHandMilli = 500 units) can be selected and confirmed normally', async () => {
    const inStock = makeItem({ id: 'item-in', nameEn: 'In Stock Item', stockOnHandMilli: 10000 });
    vi.mocked(ipc.item.topSelling).mockResolvedValue([inStock]);
    const onConfirmLine = vi.fn();

    render(
      <ItemSearchPanel
        lookups={null}
        uomName={() => 'Piece'}
        onConfirmLine={onConfirmLine}
        onCheckoutTrigger={() => {}}
        onError={() => {}}
      />,
    );

    const card = await screen.findByText('In Stock Item');
    fireEvent.click(card.closest('button') ?? card);

    // Two textboxes now: the search box plus the newly-opened inline qty
    // row — the qty input is the one that isn't the search box.
    const searchBox = screen.getByPlaceholderText('Search items — name or code');
    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(2);
    const qtyInput = textboxes.find((el) => el !== searchBox);
    if (!qtyInput) throw new Error('qty input did not open for an in-stock item');

    // Qty.fromUnits('1') = 1000 milli (1 x 1000 MILLI base) — see money.test.ts.
    fireEvent.keyDown(qtyInput, { key: 'Enter' });

    expect(onConfirmLine).toHaveBeenCalledWith(inStock, 1000, 'stock');
  });

  it('a stock-tracked item that has never had a movement (stockOnHandMilli = null) is NOT blocked', async () => {
    const neverMoved = makeItem({
      id: 'item-null',
      nameEn: 'Never Moved Item',
      stockOnHandMilli: null,
    });
    vi.mocked(ipc.item.topSelling).mockResolvedValue([neverMoved]);
    const onConfirmLine = vi.fn();

    render(
      <ItemSearchPanel
        lookups={null}
        uomName={() => 'Piece'}
        onConfirmLine={onConfirmLine}
        onCheckoutTrigger={() => {}}
        onError={() => {}}
      />,
    );

    const card = await screen.findByText('Never Moved Item');
    // No stock badge at all for null — matches resolveStockBadge's own condition.
    expect(screen.queryByText('Out of stock')).toBeNull();

    fireEvent.click(card.closest('button') ?? card);
    const searchBox = screen.getByPlaceholderText('Search items — name or code');
    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(2);
    const qtyInput = textboxes.find((el) => el !== searchBox);
    if (!qtyInput) throw new Error('qty input did not open for a never-moved item');
    fireEvent.keyDown(qtyInput, { key: 'Enter' });

    expect(onConfirmLine).toHaveBeenCalledWith(neverMoved, 1000, 'stock');
  });
});
