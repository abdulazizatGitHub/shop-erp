import { describe, it, expect } from 'vitest';
import { Money } from './money.js';
import { Qty } from './quantity.js';

describe('Money', () => {
  it('parses rupees into paisa', () => {
    // Rs 1,250.50 = 125050 paisa
    expect(Money.fromRupees('1,250.50')).toBe(125050);
    expect(Money.fromRupees(34500.5)).toBe(3450050);
  });

  it('rejects non-integer paisa', () => {
    expect(() => Money.of(10.5)).toThrow(RangeError);
  });

  it('multiplies price by a fractional quantity correctly', () => {
    // 0.4 kg of gas @ Rs 4,200/kg = Rs 1,680.00 = 168000 paisa
    const unitPricePaisa = Money.fromRupees(4200);
    const quantityMilli = Qty.fromUnits(0.4);
    expect(Money.multiplyByQuantity(unitPricePaisa, quantityMilli)).toBe(168000);
  });

  it('handles a repeating-decimal case without drift', () => {
    // 3 items @ Rs 1,250.50 = Rs 3,751.50 = 375150 paisa
    const unitPricePaisa = Money.fromRupees(1250.5);
    expect(Money.multiplyByQuantity(unitPricePaisa, Qty.fromUnits(3))).toBe(375150);
  });

  it('applies basis points for tax', () => {
    // 17% of Rs 1,000.00 = Rs 170.00 = 17000 paisa
    expect(Money.applyBasisPoints(Money.fromRupees(1000), 1700)).toBe(17000);
  });

  it('sums without floating point drift', () => {
    // 0.1 + 0.2 in rupees would be 0.30000000000000004 as a float
    const a = Money.fromRupees(0.1);
    const b = Money.fromRupees(0.2);
    expect(Money.sum([a, b])).toBe(30); // exactly 30 paisa
  });

  it('formats for display', () => {
    expect(Money.format(Money.fromRupees(34500.5))).toBe('Rs 34,500.50');
    expect(Money.format(Money.fromRupees(1200))).toBe('Rs 1,200');
    expect(Money.format(Money.fromRupees(-450.25))).toBe('-Rs 450.25');
  });
});

describe('Qty', () => {
  it('converts purchase units to stock units', () => {
    // 2 cylinders x 11.3 kg = 22.6 kg = 22600 milli-kg
    expect(Qty.convert(Qty.fromUnits(2), Qty.fromUnits(11.3))).toBe(22600);
  });

  it('subtracts fractional quantities exactly', () => {
    // 34.5 kg - 0.4 kg = 34.1 kg
    expect(Qty.subtract(Qty.fromUnits(34.5), Qty.fromUnits(0.4))).toBe(34100);
  });
});
