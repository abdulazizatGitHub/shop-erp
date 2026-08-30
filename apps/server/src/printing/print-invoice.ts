import { buildInvoiceLayout } from '@shop/core';
import type { InvoiceData } from '@shop/db';

/**
 * P4-2 wiring. Mirrors print-receipt.ts's printReceiptForSale, used by
 * the invoice:printSaleInvoice IPC handler. Always A4 — renderPdf here
 * takes only layoutText, no page-size parameter (unlike the receipt's
 * renderPdf(layoutText, pageSize)), matching invoice-pdf.ts's
 * renderInvoicePdf signature.
 */
export interface PrintInvoiceDeps {
  readonly getInvoiceData: (saleId: string) => Promise<InvoiceData | null>;
  readonly renderPdf: (layoutText: string) => Promise<Buffer>;
  readonly saveFile: (saleId: string, pdfBytes: Buffer) => Promise<string>;
  readonly print: (filePath: string) => Promise<void>;
}

export interface PrintInvoiceResult {
  readonly filePath: string;
}

export async function printInvoiceForSale(
  saleId: string,
  deps: PrintInvoiceDeps,
): Promise<PrintInvoiceResult> {
  const invoiceData = await deps.getInvoiceData(saleId);
  if (!invoiceData) {
    throw new Error(`Sale ${saleId} not found — cannot print an invoice for it`);
  }
  if (invoiceData.lines.length === 0) {
    throw new Error(`Sale ${saleId} has no line items to print`);
  }

  const layoutText = buildInvoiceLayout(invoiceData);
  const pdfBuffer = await deps.renderPdf(layoutText);
  const filePath = await deps.saveFile(saleId, pdfBuffer);
  await deps.print(filePath);

  return { filePath };
}
