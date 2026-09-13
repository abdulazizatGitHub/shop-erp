import { describe, expect, it } from 'vitest';
import {
  GRN_CSV_COLUMNS,
  parseGrnCsv,
  validateGrnCsvRows,
  type GrnCsvItemLookup,
  type PoLineForCsvImport,
} from './grn-csv-import.js';

const HEADER = GRN_CSV_COLUMNS.join(',');

const compressorLine: PoLineForCsvImport = {
  purchaseOrderLineId: 'line-compressor',
  itemId: 'item-compressor',
  orderedMilli: 5000, // 5 pieces ordered
  alreadyReceivedMilli: 0,
};

const gasLine: PoLineForCsvImport = {
  purchaseOrderLineId: 'line-gas',
  itemId: 'item-gas',
  orderedMilli: 27_200, // 27.2 kg ordered
  alreadyReceivedMilli: 0,
};

const itemsByCode = new Map<string, GrnCsvItemLookup>([
  ['ITM-0001', { id: 'item-compressor', itemCode: 'ITM-0001' }],
  ['ITM-0002', { id: 'item-gas', itemCode: 'ITM-0002' }],
  ['ITM-0099', { id: 'item-not-on-po', itemCode: 'ITM-0099' }],
]);

describe('parseGrnCsv — file-level checks', () => {
  it('case 2: wrong header rejected with an exact error message', () => {
    const csv = 'Wrong,Header,Row\nITM-0001,2,350,500,,\n';
    const result = parseGrnCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected file-level rejection');
    expect(result.fileError).toBe(`Header row must be exactly: ${GRN_CSV_COLUMNS.join(', ')}`);
  });

  it('rejects an empty file', () => {
    const result = parseGrnCsv('');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected file-level rejection');
    expect(result.fileError).toBe('The file is empty.');
  });

  it('rejects a header-only file with zero data rows', () => {
    const result = parseGrnCsv(`${HEADER}\n`);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected file-level rejection');
    expect(result.fileError).toBe('The file has no data rows.');
  });

  it('accepts a well-formed file and assigns 1-based row numbers (not counting the header)', () => {
    const csv = `${HEADER}\nITM-0001,2,350,500,,\nITM-0002,1,700,900,,\n`;
    const result = parseGrnCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rows.map((r) => r.rowNumber)).toEqual([1, 2]);
  });
});

describe('validateGrnCsvRows', () => {
  it('case 1: valid CSV with two rows — both accepted, correct paisa/milli values', () => {
    // Row 1: 2 pieces @ Rs 350.00 -> 2000 milli, 35000 paisa
    // Row 2: 1.5 kg @ Rs 100.50 -> 1500 milli, 10050 paisa
    const csv = `${HEADER}\nITM-0001,2,350,500,,\nITM-0002,1.5,100.50,150,,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [compressorLine, gasLine], itemsByCode);

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0]).toMatchObject({
      rowNumber: 1,
      itemId: 'item-compressor',
      quantityReceivedMilli: 2000,
      unitCostPaisa: 35000,
      sellingPricePaisa: 50000,
      wholesalePricePaisa: null,
    });
    expect(result.accepted[1]).toMatchObject({
      rowNumber: 2,
      itemId: 'item-gas',
      quantityReceivedMilli: 1500,
      unitCostPaisa: 10050,
      sellingPricePaisa: 15000,
      wholesalePricePaisa: null,
    });
  });

  it('case 3: Item Code not in system → row rejected with correct message', () => {
    const csv = `${HEADER}\nITM-9999,2,350,500,,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [compressorLine], itemsByCode);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toEqual([
      { rowNumber: 1, itemCode: 'ITM-9999', reason: 'Item ITM-9999 does not exist' },
    ]);
  });

  it('case 4: Item Code in system but not on this PO → row rejected', () => {
    const csv = `${HEADER}\nITM-0099,1,100,150,,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    // itemsByCode resolves ITM-0099 to a real item, but poLines below has no
    // line for it — the "on the system but not on this PO" case.
    const result = validateGrnCsvRows(parsed.rows, [compressorLine], itemsByCode);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toEqual([
      { rowNumber: 1, itemCode: 'ITM-0099', reason: 'Item ITM-0099 is not on this purchase order' },
    ]);
  });

  it('case 5: Qty exceeds remaining → row rejected with correct message showing both values', () => {
    // compressorLine has 5 ordered, 0 received -> 5 remaining. Row asks for 8.
    const csv = `${HEADER}\nITM-0001,8,350,500,,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [compressorLine], itemsByCode);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toEqual([
      {
        rowNumber: 1,
        itemCode: 'ITM-0001',
        reason: 'Qty received (8) exceeds remaining qty (5) for ITM-0001',
      },
    ]);
  });

  it('case 6: missing Unit Cost → row rejected', () => {
    const csv = `${HEADER}\nITM-0001,2,,500,,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [compressorLine], itemsByCode);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toEqual([
      { rowNumber: 1, itemCode: 'ITM-0001', reason: 'Unit Cost (Rs) is required' },
    ]);
  });

  it('case 7: Wholesale Price blank → accepted, wholesalePricePaisa = null', () => {
    const csv = `${HEADER}\nITM-0001,1,350,500,,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [compressorLine], itemsByCode);

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted[0]?.wholesalePricePaisa).toBeNull();
  });

  it('case 8: Wholesale Price present → accepted, correct paisa value', () => {
    // Wholesale Rs 480.00 -> Math.round(480.00 * 100) = 48000 paisa
    const csv = `${HEADER}\nITM-0001,1,350,500,480,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [compressorLine], itemsByCode);

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted[0]?.wholesalePricePaisa).toBe(48_000);
  });

  it('case 9: mixed valid/invalid rows — accepted returned correctly, rejected listed with correct 1-based row numbers', () => {
    const csv =
      `${HEADER}\n` +
      `ITM-0001,2,350,500,,\n` + // row 1: valid
      `ITM-9999,1,100,150,,\n` + // row 2: item doesn't exist
      `ITM-0099,1,100,150,,\n` + // row 3: item exists, not on PO
      `ITM-0002,999,700,900,,\n` + // row 4: exceeds remaining (27.2kg ordered)
      `ITM-0002,1,,900,,\n`; // row 5: missing unit cost
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [compressorLine, gasLine], itemsByCode);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.rowNumber).toBe(1);
    expect(result.rejected).toHaveLength(4);
    expect(result.rejected.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5]);
    expect(result.rejected[0]?.reason).toBe('Item ITM-9999 does not exist');
    expect(result.rejected[1]?.reason).toBe('Item ITM-0099 is not on this purchase order');
    expect(result.rejected[2]?.reason).toBe(
      'Qty received (999) exceeds remaining qty (27.2) for ITM-0002',
    );
    expect(result.rejected[3]?.reason).toBe('Unit Cost (Rs) is required');
  });

  it('case 10: UoM-conversion item (gas cylinder) — hand-calculated paisa/milli', () => {
    // 13.6 x 1000 = 13600 milli
    // 35000 x 100 = 3500000 paisa (Rs 35,000 per unit)
    // 42000 x 100 = 4200000 paisa (Rs 42,000 selling price)
    const csv = `${HEADER}\nITM-0002,13.6,35000,42000,,\n`;
    const parsed = parseGrnCsv(csv);
    if (!parsed.ok) throw new Error('expected file to parse');
    const result = validateGrnCsvRows(parsed.rows, [gasLine], itemsByCode);

    expect(result.rejected).toHaveLength(0);
    expect(result.accepted[0]).toMatchObject({
      quantityReceivedMilli: 13_600,
      unitCostPaisa: 3_500_000,
      sellingPricePaisa: 4_200_000,
    });
  });
});
