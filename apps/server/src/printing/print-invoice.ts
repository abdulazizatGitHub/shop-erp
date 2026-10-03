import { buildInvoiceLayout } from '@shop/core';
import type { InvoiceData } from '@shop/db';
import type { ReceiptPageSize } from './receipt-pdf.js';

/**
 * P4-2 wiring, rewired P17-5 (docs/phases/PHASE_17.md §2.9,
 * S17-PRINT-2a). Mirrors print-receipt.ts's printReceiptForSale, used
 * by the invoice:printSaleInvoice IPC handler. `getPageSize` reads the
 * owner's `receiptPaperSize` setting — same shape as the receipt's own
 * `getPageSize`/`renderPdf(layoutText, pageSize)` — no longer hardcoded
 * to 'A4'.
 */
export interface PrintInvoiceDeps {
  readonly getInvoiceData: (saleId: string) => Promise<InvoiceData | null>;
  readonly getPageSize: () => Promise<ReceiptPageSize>;
  readonly renderPdf: (layoutText: string, pageSize: ReceiptPageSize) => Promise<Buffer>;
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

  const pageSize = await deps.getPageSize();
  const layoutText = buildInvoiceLayout(invoiceData);
  const pdfBuffer = await deps.renderPdf(layoutText, pageSize);
  const filePath = await deps.saveFile(saleId, pdfBuffer);
  await deps.print(filePath);

  return { filePath };
}
