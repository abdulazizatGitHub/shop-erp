import { describe, expect, it } from 'vitest';
import type { PaymentReceiptData } from '@shop/db';
import { renderPaymentReceiptPdf } from './payment-receipt-pdf.js';

const KNOWN_DATA: PaymentReceiptData = {
  docNo: 'REC-0001',
  paymentDate: '2026-09-10',
  amountPaisa: 20000,
  method: 'cash',
  referenceNo: null,
  notes: null,
  customerName: 'Naeem Fridge Repairs',
  customerCode: 'CUS-0001',
  customerPhone: '0300-1234567',
  shopIdentity: {
    shopName: 'Malakand AC & Fridge Care',
    shopPhone: '0300-9999999',
    shopAddress: 'Main Bazaar, Malakand',
    shopEmail: null,
    invoiceHeaderText: null,
    invoiceFooterText: 'Goods once sold are not returnable',
    statementFooterText: null,
  },
  previousBalancePaisa: 50000,
  remainingBalancePaisa: 30000,
};

describe('renderPaymentReceiptPdf (CL-7C, rewired P17-5, S17-PRINT-2a) — takes a page-size parameter, no longer hardcoded to A4', () => {
  it('produces a real PDF at A4 size — real bytes inspected, not mocked', async () => {
    const buffer = await renderPaymentReceiptPdf(KNOWN_DATA, 'A4');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Same pdfkit built-in A4 dimensions confirmed for invoice/receipt PDFs.
    expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('produces a real PDF at A5 size when asked', async () => {
    const buffer = await renderPaymentReceiptPdf(KNOWN_DATA, 'A5');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // pdfkit's built-in A5 dimensions: 419.53 x 595.28 pt.
    expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 419.53 595.28]');
  });

  it('draws different content at the same page size as different byte sequences, proving the data actually reaches the drawing call', async () => {
    const bufferA = await renderPaymentReceiptPdf(KNOWN_DATA, 'A4');
    const bufferB = await renderPaymentReceiptPdf(
      { ...KNOWN_DATA, docNo: 'REC-9999', customerName: 'Someone Else' },
      'A4',
    );

    expect(bufferA.equals(bufferB)).toBe(false);
  });
});
