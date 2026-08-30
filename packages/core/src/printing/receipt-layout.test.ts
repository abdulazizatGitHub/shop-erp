import { describe, expect, it } from 'vitest';
import { buildReceiptLayout, type ReceiptData } from './receipt-layout.js';

describe('buildReceiptLayout (P4-1b)', () => {
  it('produces the exact layout string for a known 2-line sale, hand-calculated', () => {
    // Seed data:
    //   Line 1: Compressor 1.5 Ton, 2 Piece @ Rs 5,000.00/piece
    //     lineTotal = 500,000 paisa x 2000 milli / 1000 = 1,000,000 paisa
    //   Line 2: Copper Pipe 1/4", 10 Foot @ Rs 300.00/foot
    //     lineTotal = 30,000 paisa x 10,000 milli / 1000 = 300,000 paisa
    //   Grand total = 1,000,000 + 300,000 = 1,300,000 paisa
    //
    // Money.format (read directly from packages/shared/src/money.ts)
    // omits ".00" when the fraction is exactly zero:
    //   500,000  -> "Rs 5,000"
    //   1,000,000 -> "Rs 10,000"
    //   30,000   -> "Rs 300"
    //   300,000  -> "Rs 3,000"
    //   1,300,000 -> "Rs 13,000"
    const data: ReceiptData = {
      docNo: 'INV-0001',
      shopName: 'Malakand AC & Fridge Care', // placeholder — real shop name not yet provided
      saleDateTimeIso: '2026-08-29T14:30:00.000Z',
      lines: [
        {
          itemName: 'Compressor 1.5 Ton',
          quantityMilli: 2000,
          unitName: 'Piece',
          unitPricePaisa: 500000,
          lineTotalPaisa: 1000000,
        },
        {
          itemName: 'Copper Pipe 1/4"',
          quantityMilli: 10000,
          unitName: 'Foot',
          unitPricePaisa: 30000,
          lineTotalPaisa: 300000,
        },
      ],
      grandTotalPaisa: 1300000,
    };

    const layout = buildReceiptLayout(data);

    const expected = [
      'INV-0001',
      'Malakand AC & Fridge Care',
      '2026-08-29 14:30',
      '',
      'Compressor 1.5 Ton | 2 Piece | Rs 5,000 | Rs 10,000',
      'Copper Pipe 1/4" | 10 Foot | Rs 300 | Rs 3,000',
      '',
      'Grand Total: Rs 13,000',
    ].join('\n');

    expect(layout).toBe(expected);
  });

  it('includes a fractional quantity and a fractional paisa amount correctly', () => {
    // 2.5 Kg @ Rs 250.50/Kg = 62,550 paisa x 2500 milli / 1000... hand
    // calc the line total directly rather than trusting arithmetic:
    //   unitPricePaisa 25050, quantityMilli 2500
    //   lineTotal = 25050 * 2500 / 1000 = 62,625 paisa = Rs 626.25
    const data: ReceiptData = {
      docNo: 'INV-0002',
      shopName: 'Malakand AC & Fridge Care',
      saleDateTimeIso: '2026-08-29T09:05:00.000Z',
      lines: [
        {
          itemName: 'Refrigerant Gas',
          quantityMilli: 2500,
          unitName: 'Kg',
          unitPricePaisa: 25050,
          lineTotalPaisa: 62625,
        },
      ],
      grandTotalPaisa: 62625,
    };

    const layout = buildReceiptLayout(data);

    const expected = [
      'INV-0002',
      'Malakand AC & Fridge Care',
      '2026-08-29 09:05',
      '',
      'Refrigerant Gas | 2.5 Kg | Rs 250.50 | Rs 626.25',
      '',
      'Grand Total: Rs 626.25',
    ].join('\n');

    expect(layout).toBe(expected);
  });
});
