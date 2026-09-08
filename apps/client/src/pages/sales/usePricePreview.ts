import { useEffect } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';
import type { CartLine } from './CartTable.js';

/**
 * B-2/B-3: cart price preview. Display only — sale:create always sends
 * unitPricePaisa: null and resolves price itself (see useSaleFlow's
 * handleCheckout); this effect can never change what a sale actually
 * charges, only what the salesman sees before checkout. Walk-in
 * (priceLevelId null) naturally gets levelPaisa: null back for every
 * item, so the same code path both applies and reverts the preview.
 * Extracted out of useSaleFlow.ts to keep it under the 300-line file cap
 * (same precedent as useCart/useReceiptPrinting/useLastSale).
 */
export function usePricePreview(
  cart: readonly CartLine[],
  setCart: (updater: (prev: readonly CartLine[]) => readonly CartLine[]) => void,
  selectedCustomer: CustomerDto | null,
): void {
  const cartItemIdsKey = Array.from(new Set(cart.map((l) => l.itemId))).join(',');

  useEffect(() => {
    const itemIds = cartItemIdsKey.length > 0 ? cartItemIdsKey.split(',') : [];
    if (itemIds.length === 0) return;
    const priceLevelId = selectedCustomer?.priceLevelId ?? null;
    const customerType = selectedCustomer?.customerType ?? null;
    let cancelled = false;
    ipc.item
      .getPrices({ itemIds, priceLevelId })
      .then((prices) => {
        if (cancelled) return;
        setCart((prev) =>
          prev.map((line) => {
            const preview = prices[line.itemId];
            if (!preview) return line;
            const resolvedPaisa = preview.levelPaisa ?? preview.retailPaisa;
            const priceDiffers =
              priceLevelId !== null &&
              preview.levelPaisa !== null &&
              preview.levelPaisa !== preview.retailPaisa;
            const badge: CartLine['priceLevelBadge'] =
              priceDiffers && (customerType === 'wholesale' || customerType === 'retail')
                ? customerType
                : null;
            return { ...line, unitPricePaisa: resolvedPaisa, priceLevelBadge: badge };
          }),
        );
      })
      .catch(() => {
        // Preview lookup failed — cart keeps its last known prices, not fatal to selling.
      });
    return () => {
      cancelled = true;
    };
  }, [cartItemIdsKey, selectedCustomer?.priceLevelId, selectedCustomer?.customerType]);
}
