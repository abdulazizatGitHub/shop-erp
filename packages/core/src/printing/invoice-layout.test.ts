import { describe, expect, it } from 'vitest';
import { buildInvoiceLayout, type InvoiceLayoutData } from './invoice-layout.js';

describe('buildInvoiceLayout (P4-2)', () => {
  it('produces the exact layout string for a known wholesale invoice, hand-calculated', () => {
    // Seed data (same numbers as invoice.repository.test.ts, for cross-check):
    //   Line 1: Compressor 1.5 Ton, 2 Piece @ Rs 5,000.00/piece
    //     lineTotal = 500,000 paisa x 2000 milli / 1000 = 1,000,000 paisa
    //   Line 2: Copper Pipe 1/4", 10 Foot @ Rs 300.00/foot
    //     lineTotal = 30,000 paisa x 10,000 milli / 1000 = 300,000 paisa
    //   totalAmountPaisa = 1,000,000 + 300,000 = 1,300,000 paisa
    //   paidAmountPaisa  = 500,000 paisa
    //   balanceDuePaisa  = 1,300,000 - 500,000 = 800,000 paisa
    //
    // Money.format omits ".00" when the fraction is exactly zero
    // (verified directly from packages/shared/src/money.ts, same as
    // receipt-layout.test.ts):
    //   500,000   -> "Rs 5,000"     1,000,000 -> "Rs 10,000"
    //   30,000    -> "Rs 300"       300,000   -> "Rs 3,000"
    //   1,300,000 -> "Rs 13,000"    800,000   -> "Rs 8,000"
    const data: InvoiceLayoutData = {
      docNo: 'INV-0001',
      saleDate: '2026-08-30',
      customerName: 'Malik Traders',
      customerPhone: '0300-1234567',
      customerAddress: 'Main Bazaar, Malakand',
      lines: [
        {
          itemName: 'Compressor 1.5 Ton',
          quantityMilli: 2000,
          unitName: 'Piece',
          unitPricePaisa: 500000,
          lineTotalPaisa: 1000000,
          lineKind: 'part',
          businessUnitName: null,
        },
        {
          itemName: 'Copper Pipe 1/4"',
          quantityMilli: 10000,
          unitName: 'Foot',
          unitPricePaisa: 30000,
          lineTotalPaisa: 300000,
          lineKind: 'part',
          businessUnitName: null,
        },
      ],
      totalAmountPaisa: 1300000,
      paidAmountPaisa: 500000,
      balanceDuePaisa: 800000,
      jobDocNo: null,
      reportedFault: null,
      technicianName: null,
    };

    const layout = buildInvoiceLayout(data);

    const expected = [
      'INV-0001',
      'Customer: Malik Traders',
      'Phone: 0300-1234567',
      'Address: Main Bazaar, Malakand',
      'Date: 2026-08-30',
      '',
      'Compressor 1.5 Ton | 2 Piece | Rs 5,000 | Rs 10,000',
      'Copper Pipe 1/4" | 10 Foot | Rs 300 | Rs 3,000',
      '',
      'Total: Rs 13,000',
      'Paid: Rs 5,000',
      'Balance Due: Rs 8,000',
    ].join('\n');

    expect(layout).toBe(expected);
  });

  it('omits Phone/Address lines and shows "Walk-in" when the sale has no customer', () => {
    // 1 Piece @ Rs 1,000.00, paid in full -> balance due 0
    const data: InvoiceLayoutData = {
      docNo: 'INV-0002',
      saleDate: '2026-08-30',
      customerName: null,
      customerPhone: null,
      customerAddress: null,
      lines: [
        {
          itemName: 'Widget',
          quantityMilli: 1000,
          unitName: 'Piece',
          unitPricePaisa: 100000,
          lineTotalPaisa: 100000,
          lineKind: 'part',
          businessUnitName: null,
        },
      ],
      totalAmountPaisa: 100000,
      paidAmountPaisa: 100000,
      balanceDuePaisa: 0,
      jobDocNo: null,
      reportedFault: null,
      technicianName: null,
    };

    const layout = buildInvoiceLayout(data);

    const expected = [
      'INV-0002',
      'Customer: Walk-in',
      'Date: 2026-08-30',
      '',
      'Widget | 1 Piece | Rs 1,000 | Rs 1,000',
      '',
      'Total: Rs 1,000',
      'Paid: Rs 1,000',
      'Balance Due: Rs 0',
    ].join('\n');

    expect(layout).toBe(expected);
  });

  it('P6-10: prints job/fault/technician header lines and groups lines by business unit for a job delivery', () => {
    // 1 part line (Spare Parts unit) + 1 labour line (Repair unit).
    //   Part:   Rs 800.00/foot x 5 feet = 80,000 paisa x 5000 milli / 1000 = 400,000 paisa.
    //   Labour: flat Rs 1,200.00 = 120,000 paisa (quantity is always 1000 milli — see job-delivery.repository.ts).
    //   totalAmountPaisa = 400,000 + 120,000 = 520,000 paisa.
    const data: InvoiceLayoutData = {
      docNo: 'INV-0010',
      saleDate: '2026-09-05',
      customerName: 'Malik Traders',
      customerPhone: null,
      customerAddress: null,
      lines: [
        {
          itemName: 'Copper Pipe 1/4"',
          quantityMilli: 5000,
          unitName: 'Foot',
          unitPricePaisa: 80000,
          lineTotalPaisa: 400000,
          lineKind: 'part',
          businessUnitName: 'Spare Parts',
        },
        {
          itemName: 'AC Gas Charging',
          quantityMilli: 1000,
          unitName: '',
          unitPricePaisa: 120000,
          lineTotalPaisa: 120000,
          lineKind: 'labour',
          businessUnitName: 'Repair',
        },
      ],
      totalAmountPaisa: 520000,
      paidAmountPaisa: 0,
      balanceDuePaisa: 520000,
      jobDocNo: 'JOB-0007',
      reportedFault: 'Not cooling',
      technicianName: 'Naeem',
    };

    const layout = buildInvoiceLayout(data);

    const expected = [
      'INV-0010',
      'Customer: Malik Traders',
      'Date: 2026-09-05',
      'Job: JOB-0007',
      'Fault: Not cooling',
      'Technician: Naeem',
      '',
      '-- Spare Parts --',
      'Copper Pipe 1/4" | 5 Foot | Rs 800 | Rs 4,000',
      '-- Repair --',
      'AC Gas Charging | 1 | Rs 1,200 | Rs 1,200',
      '',
      'Total: Rs 5,200',
      'Paid: Rs 0',
      'Balance Due: Rs 5,200',
    ].join('\n');

    expect(layout).toBe(expected);
  });

  it('P6-10: shows "Unassigned" when a job delivery has no technician', () => {
    const data: InvoiceLayoutData = {
      docNo: 'INV-0011',
      saleDate: '2026-09-05',
      customerName: null,
      customerPhone: null,
      customerAddress: null,
      lines: [
        {
          itemName: 'AC Gas Charging',
          quantityMilli: 1000,
          unitName: '',
          unitPricePaisa: 120000,
          lineTotalPaisa: 120000,
          lineKind: 'labour',
          businessUnitName: 'Repair',
        },
      ],
      totalAmountPaisa: 120000,
      paidAmountPaisa: 120000,
      balanceDuePaisa: 0,
      jobDocNo: 'JOB-0008',
      reportedFault: null,
      technicianName: null,
    };

    const layout = buildInvoiceLayout(data);

    expect(layout).toContain('Job: JOB-0008');
    expect(layout).toContain('Technician: Unassigned');
    expect(layout).not.toContain('Fault:');
  });
});
