import { printInvoiceForSale, type PrintInvoiceDeps } from './print-invoice.js';

/**
 * P4-2 wiring. "Print Invoice" is a deliberate button click after a
 * sale already exists — same error-isolation contract as the receipt's
 * print-after-commit (create-sale-and-print.ts): any failure anywhere
 * in the pipeline (data lookup, render, save, print) is caught and
 * surfaced as printError, never thrown. Unlike Reprint (which does
 * throw — no sale creation to protect there either, but the owner's
 * instruction for THIS button was explicit: same isolation as receipt).
 */
export interface InvoicePrintOutcome {
  readonly filePath: string | null;
  readonly printError: string | null;
}

export async function printInvoiceSafely(
  saleId: string,
  deps: PrintInvoiceDeps,
): Promise<InvoicePrintOutcome> {
  try {
    const result = await printInvoiceForSale(saleId, deps);
    return { filePath: result.filePath, printError: null };
  } catch (err) {
    return {
      filePath: null,
      printError: err instanceof Error ? err.message : 'Failed to print invoice',
    };
  }
}
