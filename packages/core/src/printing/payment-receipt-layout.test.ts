import { describe, expect, it } from 'vitest';
import { buildPaymentReceiptLayout, type PaymentReceiptData } from './payment-receipt-layout.js';

const BASE_DATA: PaymentReceiptData = {
  docNo: 'REC-0001',
  paymentDate: '2026-09-10',
  amountPaisa: 20000,
  method: 'cash',
  referenceNo: null,
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

describe('buildPaymentReceiptLayout (CL-7B)', () => {
  it('layout contains the receipt number and customer name', () => {
    const layout = buildPaymentReceiptLayout(BASE_DATA);
    expect(layout.documentSection.receiptNo).toBe('REC-0001');
    expect(layout.customerSection.name).toBe('Naeem Fridge Repairs');
  });

  it('paymentSection values match input data exactly', () => {
    const layout = buildPaymentReceiptLayout(BASE_DATA);
    expect(layout.paymentSection).toEqual({
      amountPaisa: 20000,
      previousBalancePaisa: 50000,
      remainingBalancePaisa: 30000,
    });
  });

  it('footerText equals shopIdentity.invoiceFooterText', () => {
    const layout = buildPaymentReceiptLayout(BASE_DATA);
    expect(layout.footerText).toBe('Goods once sold are not returnable');
  });
});
