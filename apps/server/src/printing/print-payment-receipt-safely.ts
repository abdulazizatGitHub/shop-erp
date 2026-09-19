import {
  printPaymentReceiptForPayment,
  type PrintPaymentReceiptDeps,
} from './print-payment-receipt.js';

/** CL-7C. Mirrors print-invoice-safely.ts's printInvoiceSafely — never throws. */
export interface PaymentReceiptPrintOutcome {
  readonly filePath: string | null;
  readonly printError: string | null;
}

export async function printPaymentReceiptSafely(
  paymentId: string,
  deps: PrintPaymentReceiptDeps,
): Promise<PaymentReceiptPrintOutcome> {
  try {
    const result = await printPaymentReceiptForPayment(paymentId, deps);
    return { filePath: result.filePath, printError: null };
  } catch (err) {
    return {
      filePath: null,
      printError: err instanceof Error ? err.message : 'Failed to print payment receipt',
    };
  }
}
