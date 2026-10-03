import type { PaymentReceiptData } from '@shop/db';
import type { ReceiptPageSize } from './receipt-pdf.js';

/**
 * CL-7C, rewired P17-5 (docs/phases/PHASE_17.md §2.9, S17-PRINT-2a).
 * Mirrors print-invoice.ts's printInvoiceForSale — `getPageSize` reads
 * the owner's `receiptPaperSize` setting instead of leaving
 * renderPaymentReceiptPdf hardcoded to 'A4'.
 */
export interface PrintPaymentReceiptDeps {
  readonly getReceiptData: (paymentId: string) => Promise<PaymentReceiptData | null>;
  readonly getPageSize: () => Promise<ReceiptPageSize>;
  readonly renderPdf: (data: PaymentReceiptData, pageSize: ReceiptPageSize) => Promise<Buffer>;
  readonly saveFile: (paymentId: string, pdfBytes: Buffer) => Promise<string>;
  readonly print: (filePath: string) => Promise<void>;
}

export interface PrintPaymentReceiptResult {
  readonly filePath: string;
}

export async function printPaymentReceiptForPayment(
  paymentId: string,
  deps: PrintPaymentReceiptDeps,
): Promise<PrintPaymentReceiptResult> {
  const receiptData = await deps.getReceiptData(paymentId);
  if (!receiptData) {
    throw new Error(`Payment ${paymentId} not found — cannot print a receipt for it`);
  }

  const pageSize = await deps.getPageSize();
  const pdfBuffer = await deps.renderPdf(receiptData, pageSize);
  const filePath = await deps.saveFile(paymentId, pdfBuffer);
  await deps.print(filePath);

  return { filePath };
}
