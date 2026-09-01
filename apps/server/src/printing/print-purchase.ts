import type { PurchasePrintData } from '@shop/db';

/**
 * Mirrors print-invoice.ts's printInvoiceForSale exactly, used by the
 * purchase:printOrder IPC handler. renderPdf here writes to a path
 * (computeOutputPath) rather than returning a Buffer for a separate
 * save step — matches purchase-pdf.ts's renderPurchasePdf(data, outputPath)
 * signature, per spec.
 */
export interface PrintPurchaseDeps {
  readonly getPurchasePrintData: (purchaseId: string) => Promise<PurchasePrintData | null>;
  readonly renderPdf: (data: PurchasePrintData, outputPath: string) => Promise<void>;
  readonly computeOutputPath: (purchaseId: string) => string;
  readonly print: (filePath: string) => Promise<void>;
}

export interface PrintPurchaseResult {
  readonly filePath: string;
}

export async function printPurchaseOrder(
  purchaseId: string,
  deps: PrintPurchaseDeps,
): Promise<PrintPurchaseResult> {
  const data = await deps.getPurchasePrintData(purchaseId);
  if (!data) {
    throw new Error(`Purchase ${purchaseId} not found — cannot print a purchase order for it`);
  }

  const filePath = deps.computeOutputPath(purchaseId);
  await deps.renderPdf(data, filePath);
  await deps.print(filePath);

  return { filePath };
}
