import type { PaymentReceiptData } from '@shop/db';

/** CL-7C. Mirrors print-invoice.ts's printInvoiceForSale. */
export interface PrintPaymentReceiptDeps {
  readonly getReceiptData: (paymentId: string) => Promise<PaymentReceiptData | null>;
  readonly renderPdf: (data: PaymentReceiptData) => Promise<Buffer>;
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

  const pdfBuffer = await deps.renderPdf(receiptData);
  const filePath = await deps.saveFile(paymentId, pdfBuffer);
  await deps.print(filePath);

  return { filePath };
}
