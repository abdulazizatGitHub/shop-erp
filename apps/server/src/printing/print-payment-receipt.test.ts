import { describe, expect, it, vi } from 'vitest';
import type { PaymentReceiptData } from '@shop/db';
import { printPaymentReceiptForPayment } from './print-payment-receipt.js';

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

describe('printPaymentReceiptForPayment (CL-7C, rewired P17-5) — reads receiptPaperSize, no longer hardcoded to A4', () => {
  it('looks up the receipt data and calls the PDF generator with the data and the page size', async () => {
    const getReceiptData = vi.fn().mockResolvedValue(KNOWN_DATA);
    const getPageSize = vi.fn().mockResolvedValue('A5' as const);
    const renderPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
    const saveFile = vi.fn().mockResolvedValue('C:\\temp\\receipt-p1-x.pdf');
    const print = vi.fn().mockResolvedValue(undefined);

    const result = await printPaymentReceiptForPayment('payment-1', {
      getReceiptData,
      getPageSize,
      renderPdf,
      saveFile,
      print,
    });

    expect(getReceiptData).toHaveBeenCalledWith('payment-1');

    const call = renderPdf.mock.calls[0] as [PaymentReceiptData, string];
    expect(call).toHaveLength(2);
    const [dataArg, pageSizeArg] = call;
    expect(dataArg).toEqual(KNOWN_DATA);
    expect(pageSizeArg).toBe('A5');

    expect(saveFile).toHaveBeenCalledWith('payment-1', Buffer.from('%PDF-fake'));
    expect(print).toHaveBeenCalledWith('C:\\temp\\receipt-p1-x.pdf');
    expect(result.filePath).toBe('C:\\temp\\receipt-p1-x.pdf');
  });

  it('passes A4 through unchanged when that is the configured size (default, visually unchanged from before P17-5)', async () => {
    const getPageSize = vi.fn().mockResolvedValue('A4' as const);
    const renderPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));

    await printPaymentReceiptForPayment('payment-1', {
      getReceiptData: vi.fn().mockResolvedValue(KNOWN_DATA),
      getPageSize,
      renderPdf,
      saveFile: vi.fn().mockResolvedValue('x.pdf'),
      print: vi.fn().mockResolvedValue(undefined),
    });

    const [, pageSizeArg] = renderPdf.mock.calls[0] as [PaymentReceiptData, string];
    expect(pageSizeArg).toBe('A4');
  });

  it('throws a clear error when the payment cannot be found, without calling the PDF generator', async () => {
    const getReceiptData = vi.fn().mockResolvedValue(null);
    const renderPdf = vi.fn();

    await expect(
      printPaymentReceiptForPayment('missing-payment', {
        getReceiptData,
        getPageSize: vi.fn(),
        renderPdf,
        saveFile: vi.fn(),
        print: vi.fn(),
      }),
    ).rejects.toThrow(/missing-payment/);

    expect(renderPdf).not.toHaveBeenCalled();
  });
});
