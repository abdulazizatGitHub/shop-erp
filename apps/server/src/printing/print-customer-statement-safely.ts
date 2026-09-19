import {
  printCustomerStatementForCustomer,
  type PrintCustomerStatementDeps,
} from './print-customer-statement.js';

/** CL-8C. Mirrors print-payment-receipt-safely.ts — never throws. */
export interface CustomerStatementPrintOutcome {
  readonly filePath: string | null;
  readonly printError: string | null;
}

export async function printCustomerStatementSafely(
  customerId: string,
  fromDate: string,
  toDate: string,
  deps: PrintCustomerStatementDeps,
): Promise<CustomerStatementPrintOutcome> {
  try {
    const result = await printCustomerStatementForCustomer(customerId, fromDate, toDate, deps);
    return { filePath: result.filePath, printError: null };
  } catch (err) {
    return {
      filePath: null,
      printError: err instanceof Error ? err.message : 'Failed to print customer statement',
    };
  }
}
