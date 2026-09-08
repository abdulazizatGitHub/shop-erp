import { useState } from 'react';
import { ipc } from '../../lib/ipc.js';
import type { ConfirmedSale } from './SaleSuccessModal.js';

/**
 * Reprint/print-invoice actions for the success card — split out of
 * useSaleFlow.ts to keep both files under the 300-line file cap. Reads
 * confirmedSale and reports failures through setPrintError, both owned
 * by useSaleFlow (the success card can only reprint/print an already-
 * confirmed sale).
 */
export function useReceiptPrinting(
  confirmedSale: ConfirmedSale | null,
  setPrintError: (message: string | null) => void,
): {
  reprinting: boolean;
  invoicePrinting: boolean;
  handleReprint: () => Promise<void>;
  handlePrintInvoice: () => Promise<void>;
} {
  const [reprinting, setReprinting] = useState(false);
  const [invoicePrinting, setInvoicePrinting] = useState(false);

  async function handleReprint(): Promise<void> {
    if (!confirmedSale) return;
    setReprinting(true);
    try {
      await ipc.print.reprintReceipt(confirmedSale.id);
      setPrintError(null);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Reprint failed');
    } finally {
      setReprinting(false);
    }
  }

  async function handlePrintInvoice(): Promise<void> {
    if (!confirmedSale) return;
    setInvoicePrinting(true);
    try {
      // invoice:printSaleInvoice never throws for a print failure — same
      // error isolation as the receipt — so this reads printError off
      // the result rather than relying on a catch for that case.
      const outcome = await ipc.invoice.printSaleInvoice(confirmedSale.id);
      setPrintError(outcome.printError);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Print invoice failed');
    } finally {
      setInvoicePrinting(false);
    }
  }

  return { reprinting, invoicePrinting, handleReprint, handlePrintInvoice };
}
