import { Money } from '@shop/shared';
import type { NegativeStockItem } from './sale.repository.port.js';

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

/** One item's requested quantity already summed across every cart line for that item (P17-1 D17-1 — the caller must do the summing; excludes trackStock=false items). */
export interface NegativeStockCandidate {
  readonly itemId: string;
  readonly name: string;
  readonly onHandMilli: number;
  readonly requestedMilli: number;
}

/**
 * P17-1 (docs/phases/PHASE_17.md §2.1). Which of the given per-item,
 * already-summed candidates would take the Shop counter's stock below
 * zero. Exactly 0 remaining is allowed (isStockBelowZero's own strict
 * `< 0`). Callers must exclude trackStock=false items and pre-sum every
 * cart line for the same item before calling this — this function has
 * no notion of stock tracking or per-line quantities.
 */
export function computeNegativeStockItems(
  candidates: readonly NegativeStockCandidate[],
): readonly NegativeStockItem[] {
  return candidates
    .filter((c) => isStockBelowZero(c.onHandMilli, c.requestedMilli))
    .map((c) => ({
      itemId: c.itemId,
      name: c.name,
      onHandMilli: c.onHandMilli,
      requestedMilli: c.requestedMilli,
    }));
}
