import { Money } from '@shop/shared';

/**
 * Pure business logic for the counter sale. No DB calls — the repository
 * feeds these functions pre-fetched data and applies the results.
 */

export interface PriceLevelInfo {
  readonly id: string;
  readonly isDefault: boolean;
}

export interface ItemPriceInfo {
  readonly priceLevelId: string;
  readonly pricePaisa: number;
}

/**
 * Price resolution order (settled, do not change):
 *   1. Customer has a price level -> look up item_price for that level.
 *   2. No price level (walk-in or unset) -> use the default Retail level.
 *   3. No item_price row for the resolved level -> fall back to Retail.
 *   4. Still no Retail row -> a data error, not a warning. Throws.
 */
export function resolvePricePaisa(
  customerPriceLevelId: string | null,
  itemPrices: readonly ItemPriceInfo[],
  priceLevels: readonly PriceLevelInfo[],
): number {
  const defaultLevel = priceLevels.find((level) => level.isDefault);
  if (!defaultLevel) {
    throw new Error('No default (Retail) price level configured — has the seed run?');
  }

  const resolvedLevelId = customerPriceLevelId ?? defaultLevel.id;

  const resolvedPrice = itemPrices.find((p) => p.priceLevelId === resolvedLevelId);
  if (resolvedPrice) return resolvedPrice.pricePaisa;

  const defaultPrice = itemPrices.find((p) => p.priceLevelId === defaultLevel.id);
  if (defaultPrice) return defaultPrice.pricePaisa;

  throw new Error('No resolvable price for this item — no Retail item_price row exists.');
}

/** unitPricePaisa x quantityMilli -> Paisa. Integer arithmetic only (Money.multiplyByQuantity). */
export function computeLineTotalPaisa(unitPricePaisa: number, quantityMilli: number): number {
  return Money.multiplyByQuantity(Money.of(unitPricePaisa), quantityMilli);
}

/** true = this sale would push the customer over their credit limit. null limit = unlimited. */
export function isCreditLimitExceeded(
  currentBalancePaisa: number,
  creditLimitPaisa: number | null,
  newChargePaisa: number,
): boolean {
  if (creditLimitPaisa === null) return false;
  return currentBalancePaisa + newChargePaisa > creditLimitPaisa;
}

/** true = this sale would take the item's stock below zero. */
export function isStockBelowZero(currentQtyMilli: number, requestedQtyMilli: number): boolean {
  return currentQtyMilli - requestedQtyMilli < 0;
}
