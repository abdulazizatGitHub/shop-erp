import type { SaleResult } from '@shop/contracts';
import type { PrintReceiptResult } from './print-receipt.js';

/**
 * P4-1c print-after-commit. A committed sale must never be rolled back
 * or lost because printing failed (docs/SYSTEM_DESIGN.md section 8).
 * createSale's own failure is a real, blocking rejection — the sale
 * never happened. printReceipt's failure is caught and attached as
 * printError instead, so the caller (the sale IPC handler) still
 * returns the sale result to the renderer.
 */
export interface CreateSaleAndPrintResult extends SaleResult {
  readonly printError: string | null;
}

export async function createSaleAndPrintReceipt(
  createSale: () => Promise<SaleResult>,
  printReceipt: (saleId: string) => Promise<PrintReceiptResult>,
): Promise<CreateSaleAndPrintResult> {
  const result = await createSale();

  try {
    await printReceipt(result.id);
    return { ...result, printError: null };
  } catch (err) {
    return {
      ...result,
      printError: err instanceof Error ? err.message : 'Failed to print receipt',
    };
  }
}
