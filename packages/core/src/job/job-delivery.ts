/**
 * Pure functions for job delivery — no DB access, matching the pattern
 * established in sale/sale.ts (resolvePricePaisa, isCreditLimitExceeded).
 */

interface PayerLine {
  readonly payerPartyId: string | null;
}

/** Unique, non-null payer party ids across a delivery's part + labour lines. */
export function distinctPayerIds(lines: readonly PayerLine[]): readonly string[] {
  return [...new Set(lines.map((l) => l.payerPartyId).filter((id): id is string => id !== null))];
}

/**
 * No policy exists for allocating a partial payment across more than one
 * distinct payer — not inventing one. Single payer: paidPaisa applies
 * against their total exactly like a counter sale (createSale). Multiple
 * payers: paidPaisa must be 0, or every line is implicitly fully unpaid
 * per payer.
 */
export function validateMultiPayerPayment(payerIds: readonly string[], paidPaisa: number): void {
  if (payerIds.length > 1 && paidPaisa > 0) {
    throw new Error(
      'Partial payment across multiple payers is not supported — pay each invoice separately',
    );
  }
}
