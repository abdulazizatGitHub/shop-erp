import { Money } from '@shop/shared';

/**
 * P16-3b — "Rs 500 fixed" / "10% of Rs 4,000" basis text for a claim's
 * suggested amount, from the FIX-C2 snapshot (never re-reads
 * service_charge, which may have changed since delivery).
 */
export function commissionBasisText(
  mode: 'fixed' | 'bp',
  commissionAmountPaisa: number | null,
  commissionBp: number | null,
  labourAmountPaisa: number,
): string {
  if (mode === 'fixed') {
    return `${Money.format(Money.of(commissionAmountPaisa ?? 0))} fixed`;
  }
  return `${String(Money.toPercent(commissionBp ?? 0))}% of ${Money.format(Money.of(labourAmountPaisa))}`;
}
