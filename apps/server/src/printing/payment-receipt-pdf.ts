import { Money, type Paisa } from '@shop/shared';
import { buildPaymentReceiptLayout } from '@shop/core';
import type { PaymentReceiptData } from '@shop/db';
import { renderReceiptPdf } from './receipt-pdf.js';

/**
 * CL-7C. Reuses renderReceiptPdf's pdfkit drawing (same as renderInvoicePdf)
 * rather than duplicating pdfkit code — flattens buildPaymentReceiptLayout's
 * structured sections into the same layout-text shape receipt/invoice PDFs
 * already use. Always A4, like renderInvoicePdf.
 */
export function renderPaymentReceiptPdf(data: PaymentReceiptData): Promise<Buffer> {
  const layout = buildPaymentReceiptLayout(data);

  const lines = [
    layout.shopSection.name,
    ...(layout.shopSection.phone !== null ? [layout.shopSection.phone] : []),
    ...(layout.shopSection.address !== null ? [layout.shopSection.address] : []),
    '',
    `Receipt: ${layout.documentSection.receiptNo}`,
    `Date: ${layout.documentSection.date}`,
    `Method: ${layout.documentSection.method}`,
    ...(layout.documentSection.referenceNo !== null
      ? [`Reference: ${layout.documentSection.referenceNo}`]
      : []),
    '',
    `Customer: ${layout.customerSection.name} (${layout.customerSection.code})`,
    ...(layout.customerSection.phone !== null ? [layout.customerSection.phone] : []),
    '',
    `Amount received: ${Money.format(layout.paymentSection.amountPaisa as Paisa)}`,
    `Previous balance: ${Money.format(layout.paymentSection.previousBalancePaisa as Paisa)}`,
    `Remaining balance: ${Money.format(layout.paymentSection.remainingBalancePaisa as Paisa)}`,
    ...(layout.footerText !== null ? ['', layout.footerText] : []),
  ];

  return renderReceiptPdf(lines.join('\n'), 'A4');
}
