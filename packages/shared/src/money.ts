/**
 * Money — INTEGER paisa only. See ADR-0003.
 *
 * Rs 34,500.50 is stored as 3450050.
 * NEVER use a float for money anywhere in this codebase.
 */

export type Paisa = number & { readonly __brand: 'Paisa' };

const PAISA_PER_RUPEE = 100;

function assertInteger(value: number, what: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${what} must be an integer (paisa), got ${String(value)}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} exceeds safe integer range: ${String(value)}`);
  }
}

/** Round half away from zero — the convention used throughout. Documented in ADR-0003. */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export const Money = {
  /** Build paisa from an integer. Throws on a non-integer. */
  of(paisa: number): Paisa {
    assertInteger(paisa, 'Money');
    return paisa as Paisa;
  },

  /** Parse user input in rupees ("1,250.50") into paisa. */
  fromRupees(rupees: number | string): Paisa {
    const n = typeof rupees === 'string' ? Number(rupees.replace(/[,\s]/g, '')) : rupees;
    if (!Number.isFinite(n)) throw new RangeError(`Invalid rupee amount: ${String(rupees)}`);
    return roundHalfUp(n * PAISA_PER_RUPEE) as Paisa;
  },

  toRupees(paisa: Paisa): number {
    return paisa / PAISA_PER_RUPEE;
  },

  add(a: Paisa, b: Paisa): Paisa {
    return Money.of(a + b);
  },

  subtract(a: Paisa, b: Paisa): Paisa {
    return Money.of(a - b);
  },

  sum(values: readonly Paisa[]): Paisa {
    return Money.of(values.reduce<number>((acc, v) => acc + v, 0));
  },

  /**
   * unitPricePaisa x quantityMilli -> Paisa.
   * Quantity is in milli-units, so divide by 1000 and round.
   */
  multiplyByQuantity(unitPricePaisa: Paisa, quantityMilli: number): Paisa {
    assertInteger(quantityMilli, 'Quantity');
    return roundHalfUp((unitPricePaisa * quantityMilli) / 1000) as Paisa;
  },

  /** Apply basis points (1700 = 17%). Used for tax and margin. */
  applyBasisPoints(paisa: Paisa, basisPoints: number): Paisa {
    assertInteger(basisPoints, 'Basis points');
    return roundHalfUp((paisa * basisPoints) / 10_000) as Paisa;
  },

  /**
   * Parse user input in whole-or-fractional percent ("12.34") into basis
   * points (1234). Unlike fromRupees, this does NOT round away a
   * sub-basis-point remainder — basis points are already this rate's
   * smallest representable unit (a "0.005%" input has no bp value), so a
   * percent that doesn't resolve to an exact integer number of basis
   * points is a rejected input, not a silently-rounded one. Throws
   * RangeError on unparseable input or a non-integer bp result.
   */
  fromPercent(percent: number | string): number {
    const n = typeof percent === 'string' ? Number(percent.replace(/[,\s]/g, '')) : percent;
    if (!Number.isFinite(n)) throw new RangeError(`Invalid percent amount: ${String(percent)}`);
    const bp = n * 100;
    const rounded = Math.round(bp);
    // Tolerance, not an exact-integer check — n*100 in floating point
    // (e.g. 12.34 * 100 === 1233.9999999999998) must still be accepted;
    // a genuine sub-basis-point remainder (12.345 -> 1234.5) must not.
    if (Math.abs(bp - rounded) > 1e-6) {
      throw new RangeError(
        `Percent does not resolve to a whole basis-point value: ${String(percent)}`,
      );
    }
    return rounded;
  },

  /** Inverse of fromPercent — basis points to a whole-or-fractional percent, for display. */
  toPercent(basisPoints: number): number {
    return basisPoints / 100;
  },

  negate(paisa: Paisa): Paisa {
    return Money.subtract(Money.ZERO, paisa);
  },

  isZero(paisa: Paisa): boolean {
    return paisa === 0;
  },

  compare(a: Paisa, b: Paisa): -1 | 0 | 1 {
    return a < b ? -1 : a > b ? 1 : 0;
  },

  /** Display only. The ONLY place money becomes a string. */
  format(paisa: Paisa, opts: { symbol?: boolean } = {}): string {
    const negative = paisa < 0;
    const abs = Math.abs(paisa);
    const rupees = Math.floor(abs / PAISA_PER_RUPEE);
    const fraction = abs % PAISA_PER_RUPEE;
    const grouped = rupees.toLocaleString('en-PK');
    const body = fraction === 0 ? grouped : `${grouped}.${String(fraction).padStart(2, '0')}`;
    const prefix = opts.symbol === false ? '' : 'Rs ';
    return `${negative ? '-' : ''}${prefix}${body}`;
  },

  ZERO: 0 as Paisa,
} as const;
