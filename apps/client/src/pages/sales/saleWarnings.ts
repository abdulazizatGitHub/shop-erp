import type { SaleResult } from '@shop/contracts';

export interface SaleWarningText {
  readonly title: string;
  readonly messages: readonly string[];
}

/**
 * BUG-Y fix: this used to be inline alertdialog text; ConfirmDialog (P4.5-0)
 * replaces it. Data gap, flagged rather than fabricated: SaleResult's
 * warnings are booleans only (stockBelowZero/creditLimitExceeded) — there
 * is no per-item name available to name in the message, so the wording
 * below is deliberately item-agnostic rather than inventing a name.
 * Extracted out of useSaleFlow.ts (pure function, no hooks) to keep it
 * under the 300-line file cap.
 */
export function computeSaleWarningText(lastResult: SaleResult | null): SaleWarningText {
  const title =
    lastResult?.warnings.stockBelowZero === true && lastResult.warnings.creditLimitExceeded
      ? 'Stock below zero & credit limit exceeded'
      : lastResult?.warnings.stockBelowZero === true
        ? 'Stock below zero'
        : 'Credit limit exceeded';
  const messages = [
    lastResult?.warnings.stockBelowZero === true &&
      'This sale will take stock below zero for one or more items. Stock will go negative.',
    lastResult?.warnings.creditLimitExceeded === true &&
      "This sale exceeds the customer's credit limit.",
  ].filter((message): message is string => typeof message === 'string');
  return { title, messages };
}
