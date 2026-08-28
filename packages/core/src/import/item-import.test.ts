import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { ITEM_COLUMNS } from './item-columns.js';
import {
  computeCostPerStockUnitPaisa,
  validateItemRows,
  type ItemImportLookups,
} from './item-import.js';

const fixturePath = path.join(import.meta.dirname, '__fixtures__/items.csv');

function baseLookups(): ItemImportLookups {
  return {
    businessUnitIdByCode: new Map([
      ['PARTS', 'bu-parts-id'],
      ['REPAIR', 'bu-repair-id'],
    ]),
    uomIdByName: new Map([
      ['kg', 'uom-kg-id'],
      ['cylinder', 'uom-cylinder-id'],
      ['piece', 'uom-piece-id'],
      ['foot', 'uom-foot-id'],
    ]),
    // No categories/brands seeded — matches P1-0 reality exactly.
    categoryIdByName: new Map(),
    brandIdByName: new Map(),
    existingItemCodes: new Set(),
    existingItemNames: new Set(),
  };
}

describe('computeCostPerStockUnitPaisa', () => {
  it('converts a per-cylinder purchase price to per-kg cost', () => {
    // 1 cylinder @ Rs 35,000, 13.6 kg/cylinder -> Rs 2,573.53/kg = 257353 paisa
    const purchasePricePaisa = 3_500_000; // Rs 35,000
    const factorMilli = 13_600; // 13.6 kg expressed in milli-units
    expect(computeCostPerStockUnitPaisa(purchasePricePaisa, factorMilli)).toBe(257_353);
  });

  it('is exact for a 1:1 factor (no purchase-unit conversion)', () => {
    // Rs 1,200.00 per piece, 1 piece = 1 stock unit -> unchanged
    expect(computeCostPerStockUnitPaisa(120_000, 1000)).toBe(120_000);
  });
});

describe('validateItemRows against the synthetic fixture', () => {
  const csvText = readFileSync(fixturePath, 'utf8');
  const { rows } = parseCsv(csvText, ITEM_COLUMNS);
  const results = validateItemRows(rows, baseLookups());

  it('parses exactly the 8 fixture rows', () => {
    expect(rows).toHaveLength(8);
  });

  it('accepts exactly the 4 valid rows and rejects the other 4', () => {
    expect(results.filter((r) => r.status === 'accepted')).toHaveLength(4);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
  });

  it('computes the gas cylinder row cost correctly — the UoM-conversion case', () => {
    const gas = results.find((r) => r.status === 'accepted' && r.record.nameEn === 'Gas R-134a');
    if (gas?.status !== 'accepted') throw new Error('expected Gas R-134a row to be accepted');

    // Fixture: Purchase Price 35000 PKR, Units per Purchase Unit 13.6 (kg
    // per cylinder). 1 cylinder @ Rs 35,000, 13.6 kg/cylinder ->
    // Rs 2,573.53/kg = 257353 paisa. "The row was accepted" proves nothing
    // by itself — this is the number that ends up on every sale of gas.
    expect(gas.record.purchaseToStockFactorMilli).toBe(13_600);
    expect(gas.record.costPerStockUnitPaisa).toBe(257_353);
    expect(gas.record.stockUomId).toBe('uom-kg-id');
    expect(gas.record.retailPricePaisa).toBe(420_000); // Rs 4,200.00
  });

  it('rejects an unmatched category, naming the exact searched string', () => {
    const row = results.find(
      (r) => r.status === 'rejected' && r.reason.includes('NonexistentCategory'),
    );
    if (row?.status !== 'rejected') throw new Error('expected a rejected row');
    expect(row.reason).toBe('Category "NonexistentCategory" not found');
  });

  it('rejects a duplicate item code reusing one already accepted in the same batch', () => {
    const accepted = results.find(
      (r) => r.status === 'accepted' && r.record.nameEn === 'Copper Pipe 10ft',
    );
    const rejected = results.find(
      (r) => r.status === 'rejected' && r.reason.includes('CU-PIPE-01'),
    );
    expect(accepted?.status).toBe('accepted');
    if (rejected?.status !== 'rejected') throw new Error('expected a rejected row');
    expect(rejected.reason).toBe('Item Code "CU-PIPE-01" already exists');
  });

  it('rejects an unrecognised business unit label', () => {
    const row = results.find((r) => r.status === 'rejected' && r.reason.includes('Nonsense'));
    if (row?.status !== 'rejected') throw new Error('expected a rejected row');
    expect(row.reason).toBe(
      'Owning Business Unit "Nonsense" is not recognised (expected "Spare Parts" or "Repair")',
    );
  });

  it('rejects a row with no retail price', () => {
    const row = results.find(
      (r) => r.status === 'rejected' && r.reason === 'Retail Price (PKR) is required',
    );
    expect(row).toBeDefined();
  });

  it('leaves category/brand null on accepted rows, since none were seeded (P1-0 reality)', () => {
    const gas = results.find((r) => r.status === 'accepted' && r.record.nameEn === 'Gas R-134a');
    if (gas?.status !== 'accepted') throw new Error('expected accepted');
    expect(gas.record.categoryId).toBeNull();
    expect(gas.record.brandId).toBeNull();
  });

  it('resolves "Repair" to the REPAIR business unit id', () => {
    const compressor = results.find(
      (r) => r.status === 'accepted' && r.record.nameEn === '1.5 Ton Compressor',
    );
    if (compressor?.status !== 'accepted') throw new Error('expected accepted');
    expect(compressor.record.businessUnitId).toBe('bu-repair-id');
    expect(compressor.record.isSerialized).toBe(true); // Has Serial No? = Y
  });
});

describe('re-running the same import does not duplicate blank-code items by name', () => {
  it('skips a blank-code row whose name already exists in the DB', () => {
    const lookups: ItemImportLookups = {
      ...baseLookups(),
      existingItemNames: new Set(['gas r-134a']), // already imported, different casing
    };
    const csvText = readFileSync(fixturePath, 'utf8');
    const { rows } = parseCsv(csvText, ITEM_COLUMNS);
    const results = validateItemRows(rows, lookups);

    const gasResult = results.find((r) => r.rowNumber === 2); // the Gas R-134a row
    expect(gasResult?.status).toBe('skipped');
  });

  it('skips a second occurrence of the same blank-code name within one batch', () => {
    const csvText = `Item Code,Item Name (English),Item Name (Urdu),Owning Business Unit,Category,Brand / Company,Variant / Spec,Selling Unit,Purchase Unit,Units per Purchase Unit,Track Stock? (Y/N),Has Serial No? (Y/N),Purchase Price (PKR),Retail Price (PKR),Wholesale Price (PKR),Low Stock Alert Qty,Shelf / Location,Notes
,Repeat Item,,Spare Parts,,,,Piece,,,Y,N,,100,,,,
,Repeat Item,,Spare Parts,,,,Piece,,,Y,N,,100,,,,
`;
    const { rows } = parseCsv(csvText, ITEM_COLUMNS);
    const results = validateItemRows(rows, baseLookups());

    expect(results[0]?.status).toBe('accepted');
    expect(results[1]?.status).toBe('skipped');
  });
});

describe('item import — alt unit columns', () => {
  const HEADER =
    'Item Code,Item Name (English),Item Name (Urdu),Owning Business Unit,Category,' +
    'Brand / Company,Variant / Spec,Selling Unit,Purchase Unit,Units per Purchase Unit,' +
    'Track Stock? (Y/N),Has Serial No? (Y/N),Purchase Price (PKR),Retail Price (PKR),' +
    'Wholesale Price (PKR),Low Stock Alert Qty,Shelf / Location,Notes,Alt Unit,Alt Factor';

  function parseOneRow(dataLine: string) {
    const csvText = `${HEADER}\n${dataLine}\n`;
    const { rows } = parseCsv(csvText, ITEM_COLUMNS);
    return validateItemRows(rows, baseLookups())[0];
  }

  it('row with Alt Unit and Alt Factor accepted — resolves to Foot, factorMilli=305', () => {
    // Math.round(0.305 x 1000) = 305
    const result = parseOneRow(',Alt Unit Item,,Spare Parts,,,,Piece,,,Y,N,,100,,,,,Foot,0.305');
    if (result?.status !== 'accepted') throw new Error('expected row to be accepted');
    expect(result.record.altUomId).toBe('uom-foot-id');
    expect(result.record.altUomFactorMilli).toBe(305);
  });

  it('row with Alt Unit but no Alt Factor rejected, naming both columns', () => {
    const result = parseOneRow(
      ',Alt Unit Missing Factor,,Spare Parts,,,,Piece,,,Y,N,,100,,,,,Foot,',
    );
    if (result?.status !== 'rejected') throw new Error('expected row to be rejected');
    expect(result.reason).toContain('Alt Unit');
    expect(result.reason).toContain('Alt Factor');
  });

  it('row with Alt Factor but no Alt Unit rejected, naming both columns', () => {
    const result = parseOneRow(
      ',Alt Factor Missing Unit,,Spare Parts,,,,Piece,,,Y,N,,100,,,,,,0.305',
    );
    if (result?.status !== 'rejected') throw new Error('expected row to be rejected');
    expect(result.reason).toContain('Alt Unit');
    expect(result.reason).toContain('Alt Factor');
  });

  it('row with both Alt Unit and Alt Factor blank accepted, both null', () => {
    const result = parseOneRow(',No Alt Unit At All,,Spare Parts,,,,Piece,,,Y,N,,100,,,,,,');
    if (result?.status !== 'accepted') throw new Error('expected row to be accepted');
    expect(result.record.altUomId).toBeNull();
    expect(result.record.altUomFactorMilli).toBeNull();
  });
});
