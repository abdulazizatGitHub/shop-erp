import { printPurchaseOrder, type PrintPurchaseDeps } from './print-purchase.js';

/**
 * Same error-isolation contract as printInvoiceSafely: a Print button
 * clicked after the purchase already exists — any failure anywhere in
 * the pipeline (data lookup, render, print) is caught and surfaced as
 * printError, never thrown. Explicitly requested for purchase printing
 * (unlike Reprint's throwing behavior).
 */
export interface PurchasePrintOutcome {
  readonly filePath: string | null;
  readonly printError: string | null;
}

export async function printPurchaseOrderSafely(
  purchaseId: string,
  deps: PrintPurchaseDeps,
): Promise<PurchasePrintOutcome> {
  try {
    const result = await printPurchaseOrder(purchaseId, deps);
    return { filePath: result.filePath, printError: null };
  } catch (err) {
    return {
      filePath: null,
      printError: err instanceof Error ? err.message : 'Failed to print purchase order',
    };
  }
}
