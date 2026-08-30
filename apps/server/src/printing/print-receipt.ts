import { buildReceiptLayout, type ReceiptLineData } from '@shop/core';
import type { ReceiptSaleData } from '@shop/db';
import type { ReceiptPageSize } from './receipt-pdf.js';

/**
 * P4-1c. One orchestration, used by both print-after-commit (sale
 * handler) and the Reprint button/channel — the two flows must not
 * diverge in what they generate. Every dependency is injected so both
 * required tests (print failure isolation, reprint calls the PDF
 * generator with correct data) can mock exactly what they need without
 * a real DB, real pdfkit, or a real printer.
 */
export interface PrintReceiptDeps {
  readonly getSaleData: (saleId: string) => Promise<ReceiptSaleData | null>;
  readonly getShopName: () => Promise<string>;
  readonly getPageSize: () => Promise<ReceiptPageSize>;
  readonly renderPdf: (layoutText: string, pageSize: ReceiptPageSize) => Promise<Buffer>;
  readonly saveFile: (saleId: string, pdfBytes: Buffer) => Promise<string>;
  readonly print: (filePath: string) => Promise<void>;
}

export interface PrintReceiptResult {
  readonly filePath: string;
}

export async function printReceiptForSale(
  saleId: string,
  deps: PrintReceiptDeps,
): Promise<PrintReceiptResult> {
  const saleData = await deps.getSaleData(saleId);
  if (!saleData) {
    throw new Error(`Sale ${saleId} not found — cannot print a receipt for it`);
  }
  if (saleData.lines.length === 0) {
    throw new Error(`Sale ${saleId} has no line items to print`);
  }

  const [shopName, pageSize] = await Promise.all([deps.getShopName(), deps.getPageSize()]);

  const lines: readonly ReceiptLineData[] = saleData.lines;
  const layoutText = buildReceiptLayout({
    docNo: saleData.docNo,
    shopName,
    saleDateTimeIso: saleData.createdAt,
    lines,
    grandTotalPaisa: saleData.totalAmountPaisa,
  });

  const pdfBuffer = await deps.renderPdf(layoutText, pageSize);
  const filePath = await deps.saveFile(saleId, pdfBuffer);
  await deps.print(filePath);

  return { filePath };
}
