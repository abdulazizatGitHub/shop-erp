import { describe, expect, it } from 'vitest';
import { mergeCartLine, type CartLine } from './CartTable.js';

const COMPRESSOR_LINE: CartLine = {
  itemId: 'item-1',
  itemLabel: 'Compressor 1.5 Ton',
  quantityMilli: 2000,
  unitPricePaisa: 500000,
  unitLabel: 'Piece',
};

describe('mergeCartLine (BUG-B fix)', () => {
  it('appends a new line when the cart is empty', () => {
    const result = mergeCartLine([], COMPRESSOR_LINE);
    expect(result).toEqual([COMPRESSOR_LINE]);
  });

  it('appends a new line when the item is not already in the cart', () => {
    const otherLine: CartLine = {
      itemId: 'item-2',
      itemLabel: 'Gas Cylinder',
      quantityMilli: 1000,
      unitPricePaisa: 3500000,
      unitLabel: 'Cylinder',
    };
    const result = mergeCartLine([COMPRESSOR_LINE], otherLine);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(otherLine);
  });

  it('BUG-B: adding the same item (same stock unit) a second time increments quantity, does not duplicate the line', () => {
    const secondAdd: CartLine = {
      itemId: 'item-1',
      itemLabel: 'Compressor 1.5 Ton',
      quantityMilli: 3000, // 3 more pieces
      unitPricePaisa: 500000,
      unitLabel: 'Piece',
    };

    const result = mergeCartLine([COMPRESSOR_LINE], secondAdd);

    // One line, not two — quantity merged: 2000 + 3000 = 5000 milli
    expect(result).toHaveLength(1);
    expect(result[0]?.quantityMilli).toBe(5000);
    expect(result[0]?.itemId).toBe('item-1');
  });

  it('an alt-unit line and a stock-unit line for the SAME item stay separate (different saleUomId)', () => {
    const stockUnitLine: CartLine = {
      itemId: 'pipe-1',
      itemLabel: 'Copper Pipe 1/4"',
      quantityMilli: 2000,
      unitPricePaisa: 100000,
      unitLabel: 'Kg',
      // no saleUomId -> sold in stock unit
    };
    const altUnitLine: CartLine = {
      itemId: 'pipe-1',
      itemLabel: 'Copper Pipe 1/4"',
      quantityMilli: 10000,
      unitPricePaisa: 30000,
      unitLabel: 'Foot',
      saleUomId: 'uom-foot',
      saleToStockFactor: 305,
    };

    const result = mergeCartLine([stockUnitLine], altUnitLine);

    // Different sale_uom_id (undefined vs 'uom-foot') -> two distinct lines, not merged
    expect(result).toHaveLength(2);
    expect(result[0]?.quantityMilli).toBe(2000);
    expect(result[1]?.quantityMilli).toBe(10000);
  });

  it('two alt-unit additions of the SAME item in the SAME alt unit merge together', () => {
    const first: CartLine = {
      itemId: 'pipe-1',
      itemLabel: 'Copper Pipe 1/4"',
      quantityMilli: 10000,
      unitPricePaisa: 30000,
      unitLabel: 'Foot',
      saleUomId: 'uom-foot',
      saleToStockFactor: 305,
    };
    const second: CartLine = {
      itemId: 'pipe-1',
      itemLabel: 'Copper Pipe 1/4"',
      quantityMilli: 5000,
      unitPricePaisa: 30000,
      unitLabel: 'Foot',
      saleUomId: 'uom-foot',
      saleToStockFactor: 305,
    };

    const result = mergeCartLine([first], second);

    expect(result).toHaveLength(1);
    expect(result[0]?.quantityMilli).toBe(15000); // 10,000 + 5,000
  });
});
