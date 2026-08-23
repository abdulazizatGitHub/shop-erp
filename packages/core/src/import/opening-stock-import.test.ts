import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { OPENING_STOCK_COLUMNS } from './item-columns.js';
import {
  validateOpeningStockRows,
  type OpeningStockImportLookups,
} from './opening-stock-import.js';

const fixturePath = path.join(import.meta.dirname, '__fixtures__/opening_stock.csv');

function baseLookups(): OpeningStockImportLookups {
  return {
    itemByNormalizedName: new Map([
      ['gas r-134a', { id: 'item-gas', stockUomId: 'uom-kg-id' }],
      ['1.5 ton compressor', { id: 'item-compressor', stockUomId: 'uom-piece-id' }],
      ['copper pipe 10ft', { id: 'item-pipe', stockUomId: 'uom-foot-id' }],
      ['fan motor', { id: 'item-fan', stockUomId: 'uom-piece-id' }],
    ]),
    itemIdsAlreadyOpened: new Set(),
  };
}

describe('validateOpeningStockRows against the synthetic fixture', () => {
  const csvText = readFileSync(fixturePath, 'utf8');
  const { rows } = parseCsv(csvText, OPENING_STOCK_COLUMNS);
  const results = validateOpeningStockRows(rows, baseLookups());

  it('parses exactly the 5 fixture rows', () => {
    expect(rows).toHaveLength(5);
  });

  it('accepts the 4 rows matching a real item, rejects the 1 that matches nothing', () => {
    expect(results.filter((r) => r.status === 'accepted')).toHaveLength(4);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('matches the gas row by name and computes quantity/cost correctly', () => {
    const gas = results.find((r) => r.status === 'accepted' && r.record.itemId === 'item-gas');
    if (gas?.status !== 'accepted') throw new Error('expected the gas opening-stock row to match');

    // Fixture: Quantity Counted 40 (kg, same unit as the item's stock
    // unit), Unit Cost 2573.53 PKR/kg.
    // 40 kg -> 40000 milli-kg. Rs 2,573.53/kg -> 257353 paisa.
    expect(gas.record.quantityMilli).toBe(40_000);
    expect(gas.record.unitCostPaisa).toBe(257_353);
  });

  it('matches "1.5 TON COMPRESSOR" to the item named "1.5 Ton Compressor" — case-insensitive', () => {
    const compressor = results.find(
      (r) => r.status === 'accepted' && r.record.itemId === 'item-compressor',
    );
    if (compressor?.status !== 'accepted') throw new Error('expected a match');
    // 10 pieces @ Rs 8,000.00 = 800000 paisa
    expect(compressor.record.quantityMilli).toBe(10_000);
    expect(compressor.record.unitCostPaisa).toBe(800_000);
  });

  it('rejects a name matching no item, naming the exact searched string', () => {
    const row = results.find(
      (r) => r.status === 'rejected' && r.reason.includes('Nonexistent Item Xyz'),
    );
    if (row?.status !== 'rejected') throw new Error('expected a rejected row');
    expect(row.reason).toBe('No item found matching name "Nonexistent Item Xyz"');
  });

  it('skips (does not duplicate) an item that already has opening stock posted', () => {
    const results2 = validateOpeningStockRows(rows, {
      ...baseLookups(),
      itemIdsAlreadyOpened: new Set(['item-gas']),
    });
    const skipped = results2.filter((r) => r.status === 'skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.reason).toContain('Gas R-134a');
    // everything else still processes normally alongside the skip
    expect(results2.filter((r) => r.status === 'accepted')).toHaveLength(3);
  });
});
