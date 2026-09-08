import { useEffect, useMemo, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';
import { lineTotalPaisa, mergeCartLine, type CartLine } from './CartTable.js';

/** Which unit the quantity field was entered in, for a confirmed cart line. */
type SaleUnit = 'stock' | 'alt';

/**
 * Owns the sale screen's cart itself — lines, subtotal, and item lookups
 * (for unit-name resolution). Split out of useSaleFlow.ts so neither file
 * crosses the 300-line cap; useSaleFlow still owns checkout/payment/
 * success, which reads this hook's cart/setCart to build the sale.
 */
export function useCart(): {
  lookups: ItemLookups | null;
  uomName: (id: string) => string;
  cart: readonly CartLine[];
  setCart: React.Dispatch<React.SetStateAction<readonly CartLine[]>>;
  cartSubtotalPaisa: number;
  confirmLine: (item: ItemDto, quantityMilli: number, saleUnit: SaleUnit) => void;
  removeLine: (index: number) => void;
  adjustQuantity: (index: number, delta: number) => void;
  clearCart: () => void;
} {
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [lookups, setLookups] = useState<ItemLookups | null>(null);

  useEffect(() => {
    ipc.item
      .lookups()
      .then(setLookups)
      .catch(() => {
        // Alt-unit name display degrades to raw uom ids; not fatal to selling.
      });
  }, []);

  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  const cartSubtotalPaisa = useMemo(
    () => Money.sum(cart.map((line) => Money.of(lineTotalPaisa(line) ?? 0))),
    [cart],
  );

  function confirmLine(item: ItemDto, quantityMilli: number, saleUnit: SaleUnit): void {
    // ADR-0013 Type 2: 'alt' only reachable when item.altUomId is set (the
    // toggle isn't rendered otherwise) — altUomId/altUomFactorMilli are
    // guaranteed non-null in that case.
    const useAltUnit = saleUnit === 'alt' && item.altUomId !== null;
    const newLine: CartLine = {
      itemId: item.id,
      itemLabel: item.nameEn,
      quantityMilli,
      unitPricePaisa: item.retailPricePaisa,
      unitLabel: useAltUnit ? uomName(item.altUomId as string) : uomName(item.stockUomId),
      saleUomId: useAltUnit ? (item.altUomId as string) : undefined,
      saleToStockFactor: useAltUnit ? (item.altUomFactorMilli as number) : undefined,
      businessUnitId: item.businessUnitId,
    };
    // BUG-B fix: merge into an existing line for the same item + same
    // unit rather than always appending a duplicate.
    setCart((prev) => mergeCartLine(prev, newLine));
  }

  function removeLine(index: number): void {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  // delta is ±1 whole display unit (i.e. ±1000 milli, per CLAUDE.md §3.2's
  // fixed 3-decimal milli scale) — a −/+ tap in the cart, not a raw milli
  // edit. A decrement to zero or below removes the line, same as trash.
  function adjustQuantity(index: number, delta: number): void {
    setCart((prev) =>
      prev.flatMap((line, i) => {
        if (i !== index) return [line];
        const nextMilli = Qty.add(Qty.of(line.quantityMilli), Qty.of(delta * 1000));
        if (nextMilli <= 0) return [];
        return [{ ...line, quantityMilli: nextMilli }];
      }),
    );
  }

  function clearCart(): void {
    setCart([]);
  }

  return {
    lookups,
    uomName,
    cart,
    setCart,
    cartSubtotalPaisa,
    confirmLine,
    removeLine,
    adjustQuantity,
    clearCart,
  };
}
