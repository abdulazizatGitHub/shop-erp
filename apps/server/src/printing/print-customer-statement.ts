import type { CustomerStatementRecord } from '@shop/db';

/** CL-8C. Mirrors print-payment-receipt.ts. */
export interface PrintCustomerStatementDeps {
  readonly getStatementData: (
    customerId: string,
    fromDate: string,
    toDate: string,
  ) => Promise<CustomerStatementRecord | null>;
  readonly renderPdf: (data: CustomerStatementRecord) => Promise<Buffer>;
  readonly saveFile: (customerId: string, pdfBytes: Buffer) => Promise<string>;
  readonly print: (filePath: string) => Promise<void>;
}

export interface PrintCustomerStatementResult {
  readonly filePath: string;
}

export async function printCustomerStatementForCustomer(
  customerId: string,
  fromDate: string,
  toDate: string,
  deps: PrintCustomerStatementDeps,
): Promise<PrintCustomerStatementResult> {
  const statementData = await deps.getStatementData(customerId, fromDate, toDate);
  if (!statementData) {
    throw new Error(`Customer ${customerId} not found — cannot print a statement for it`);
  }

  const pdfBuffer = await deps.renderPdf(statementData);
  const filePath = await deps.saveFile(customerId, pdfBuffer);
  await deps.print(filePath);

  return { filePath };
}
