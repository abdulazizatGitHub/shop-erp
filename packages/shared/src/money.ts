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
