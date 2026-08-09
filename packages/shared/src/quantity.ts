/**
 * Quantity — INTEGER milli-units. See ADR-0003.
 * 34.5 kg is stored as 34500. Three decimal places, integer-safe.
 */

export type Milli = number & { readonly __brand: 'Milli' };

const MILLI = 1000;

export const Qty = {
  of(milli: number): Milli {
    if (!Number.isInteger(milli)) {
      throw new RangeError(`Quantity must be an integer (milli-units), got ${String(milli)}`);
    }
    return milli as Milli;
  },

  /** Parse user input ("34.5") into milli-units. */
  fromUnits(units: number | string): Milli {
    const n = typeof units === 'string' ? Number(units.replace(/[,\s]/g, '')) : units;
    if (!Number.isFinite(n)) throw new RangeError(`Invalid quantity: ${String(units)}`);
    return Math.round(n * MILLI) as Milli;
  },

  toUnits(milli: Milli): number {
    return milli / MILLI;
  },

  add(a: Milli, b: Milli): Milli {
    return Qty.of(a + b);
  },

  subtract(a: Milli, b: Milli): Milli {
    return Qty.of(a - b);
  },

  sum(values: readonly Milli[]): Milli {
    return Qty.of(values.reduce<number>((acc, v) => acc + v, 0));
  },

  negate(milli: Milli): Milli {
    return Qty.subtract(Qty.ZERO, milli);
  },

  /**
   * Convert a purchase-unit quantity into stock units.
   * e.g. 2 cylinders at 11.3 kg each: convert(2000, 11300) -> 22600 milli-kg
   */
  convert(quantityMilli: Milli, factorMilli: number): Milli {
    if (!Number.isInteger(factorMilli) || factorMilli <= 0) {
      throw new RangeError(
        `Conversion factor must be a positive integer, got ${String(factorMilli)}`,
      );
    }
    return Math.round((quantityMilli * factorMilli) / MILLI) as Milli;
  },

  format(milli: Milli, opts: { unit?: string } = {}): string {
    const units = milli / MILLI;
    const text = Number.isInteger(units) ? String(units) : units.toFixed(3).replace(/0+$/, '');
    return opts.unit ? `${text} ${opts.unit}` : text;
  },

  ZERO: 0 as Milli,
} as const;
