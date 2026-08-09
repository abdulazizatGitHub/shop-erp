import { describe, it, expect } from 'vitest';
import { Money } from './money.js';
import { Qty } from './quantity.js';
import * as SharedIndex from './index.js';

describe('index barrel', () => {
  it('re-exports Money, Qty, and the id helpers', () => {
    expect(SharedIndex.Money).toBe(Money);
    expect(SharedIndex.Qty).toBe(Qty);
    expect(typeof SharedIndex.newId).toBe('function');
    expect(typeof SharedIndex.isId).toBe('function');
    expect(typeof SharedIndex.formatDocNumber).toBe('function');
  });
});

describe('Money', () => {
  it('parses rupees into paisa', () => {
    // Rs 1,250.50 = 125050 paisa
    expect(Money.fromRupees('1,250.50')).toBe(125050);
    expect(Money.fromRupees(34500.5)).toBe(3450050);
  });

  it('rejects non-integer paisa', () => {
    expect(() => Money.of(10.5)).toThrow(RangeError);
  });

  it('rejects paisa beyond the safe integer range', () => {
    // 2**60 is an exact integer value but far beyond Number.MAX_SAFE_INTEGER
    expect(() => Money.of(2 ** 60)).toThrow(RangeError);
  });

  it('rejects an unparseable rupee amount', () => {
    expect(() => Money.fromRupees('not-a-number')).toThrow(RangeError);
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

  it('formats without the symbol when asked', () => {
    // Rs 500.00 with no symbol -> "500"; negative keeps the sign
    expect(Money.format(Money.fromRupees(500), { symbol: false })).toBe('500');
    expect(Money.format(Money.negate(Money.fromRupees(500)), { symbol: false })).toBe('-500');
  });

  it('converts paisa back to rupees', () => {
    // 123456 paisa = Rs 1,234.56
    expect(Money.toRupees(Money.fromRupees(1234.56))).toBe(1234.56);
  });

  it('adds two amounts', () => {
    // Rs 1,200.00 + Rs 50.75 = Rs 1,250.75 = 125075 paisa
    expect(Money.add(Money.fromRupees(1200), Money.fromRupees(50.75))).toBe(125075);
  });

  it('negates an amount via subtract from zero', () => {
    // -(Rs 500.00) = -50000 paisa
    expect(Money.negate(Money.fromRupees(500))).toBe(-50000);
  });

  it('checks zero', () => {
    expect(Money.isZero(Money.ZERO)).toBe(true);
    expect(Money.isZero(Money.fromRupees(1))).toBe(false);
  });

  it('compares two amounts', () => {
    const ten = Money.fromRupees(10);
    const twenty = Money.fromRupees(20);
    expect(Money.compare(ten, twenty)).toBe(-1);
    expect(Money.compare(twenty, ten)).toBe(1);
    expect(Money.compare(ten, ten)).toBe(0);
  });
});

describe('Qty', () => {
  it('rejects a non-integer milli-quantity', () => {
    expect(() => Qty.of(10.5)).toThrow(RangeError);
  });

  it('rejects an unparseable quantity', () => {
    expect(() => Qty.fromUnits('not-a-number')).toThrow(RangeError);
  });

  it('converts purchase units to stock units', () => {
    // 2 cylinders x 11.3 kg = 22.6 kg = 22600 milli-kg
    expect(Qty.convert(Qty.fromUnits(2), Qty.fromUnits(11.3))).toBe(22600);
  });

  it('subtracts fractional quantities exactly', () => {
    // 34.5 kg - 0.4 kg = 34.1 kg
    expect(Qty.subtract(Qty.fromUnits(34.5), Qty.fromUnits(0.4))).toBe(34100);
  });

  it('rejects a non-positive or non-integer conversion factor', () => {
    expect(() => Qty.convert(Qty.fromUnits(1), 0)).toThrow(RangeError);
    expect(() => Qty.convert(Qty.fromUnits(1), -11300)).toThrow(RangeError);
    expect(() => Qty.convert(Qty.fromUnits(1), 11300.5)).toThrow(RangeError);
  });

  it('converts milli-units back to display units', () => {
    // 34500 milli-kg = 34.5 kg
    expect(Qty.toUnits(Qty.fromUnits(34.5))).toBe(34.5);
  });

  it('adds two quantities', () => {
    // 10 kg + 5.25 kg = 15.25 kg = 15250 milli-kg
    expect(Qty.add(Qty.fromUnits(10), Qty.fromUnits(5.25))).toBe(15250);
  });

  it('sums quantities without drift', () => {
    // 1 kg + 2.5 kg + 3 kg = 6.5 kg = 6500 milli-kg
    expect(Qty.sum([Qty.fromUnits(1), Qty.fromUnits(2.5), Qty.fromUnits(3)])).toBe(6500);
  });

  it('negates a quantity via subtract from zero', () => {
    // -(12 kg) = -12000 milli-kg
    expect(Qty.negate(Qty.fromUnits(12))).toBe(-12000);
  });

  it('formats for display', () => {
    expect(Qty.format(Qty.fromUnits(5))).toBe('5');
    expect(Qty.format(Qty.fromUnits(34.5))).toBe('34.5');
    expect(Qty.format(Qty.fromUnits(2), { unit: 'kg' })).toBe('2 kg');
  });
});
