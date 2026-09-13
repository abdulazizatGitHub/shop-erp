export interface SaleWarningText {
  readonly title: string;
  readonly messages: readonly string[];
}

/**
 * This warning-gate originally covered two conditions (see PROJECT.md
 * Known Bugs for the pre-P10 history of this dialog's own UI form).
 * P10-1 narrowed it to credit-limit only — the other condition is now
 * prevented pre-emptively at add-to-cart time instead, so useSaleFlow
 * only opens the gate on creditLimitExceeded, and this text is always the
 * same when it does. Kept as its own function (not inlined) so the
 * warning copy stays in one named place if a second warning is ever added.
 */
export function computeSaleWarningText(): SaleWarningText {
  return {
    title: 'Credit limit exceeded',
    messages: ["This sale exceeds the customer's credit limit."],
  };
}
