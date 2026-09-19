import { ipcMain } from 'electron';
import { CustomerStatementInput, PaymentIdInput, SaleIdInput } from '@shop/contracts';
import {
  createKyselyDb,
  getCustomerStatementData,
  getPaymentReceiptData,
  getReceiptPaperSize,
  getSaleReceiptData,
  getShopName,
  openDatabase,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';
import { printReceiptForSale, type PrintReceiptResult } from '../../printing/print-receipt.js';
import { printFile } from '../../printing/print-file.js';
import { renderReceiptPdf } from '../../printing/receipt-pdf.js';
import { saveReceiptToTempFile } from '../../printing/receipt-file.js';
import { renderPaymentReceiptPdf } from '../../printing/payment-receipt-pdf.js';
import { savePaymentReceiptToTempFile } from '../../printing/payment-receipt-file.js';
import {
  printPaymentReceiptSafely,
  type PaymentReceiptPrintOutcome,
} from '../../printing/print-payment-receipt-safely.js';
import { renderCustomerStatementPdf } from '../../printing/customer-statement-pdf.js';
import { saveCustomerStatementToTempFile } from '../../printing/customer-statement-file.js';
import {
  printCustomerStatementSafely,
  type CustomerStatementPrintOutcome,
} from '../../printing/print-customer-statement-safely.js';

export interface PrintHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/**
 * Reuses the exact same printReceiptForSale orchestration as the sale
 * handler's print-after-commit path (apps/server/src/printing/print-receipt.ts)
 * — the two flows must never diverge in what they generate. Unlike
 * print-after-commit, a failure here IS a real error: there is no sale
 * being created to protect, so withError's normal error path applies —
 * "sale not found" / "no line items" surface as a clean IpcError, never
 * an unhandled crash.
 */
export function registerPrintHandlers(deps: PrintHandlerDeps): void {
  ipcMain.handle(
    channels.print.reprintReceipt,
    withError(async (_event, raw: unknown): Promise<PrintReceiptResult> => {
      const input = SaleIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const kysely = createKyselyDb(db);
        return await printReceiptForSale(input.id, {
          getSaleData: (id) => getSaleReceiptData(kysely, deps.tenantId, id),
          getShopName: () => getShopName(kysely, deps.tenantId),
          getPageSize: () => getReceiptPaperSize(kysely, deps.tenantId),
          renderPdf: renderReceiptPdf,
          saveFile: saveReceiptToTempFile,
          print: printFile,
        });
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.print.printPaymentReceipt,
    withError(async (_event, raw: unknown): Promise<PaymentReceiptPrintOutcome> => {
      const input = PaymentIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const kysely = createKyselyDb(db);
        return await printPaymentReceiptSafely(input.paymentId, {
          getReceiptData: (id) => getPaymentReceiptData(kysely, deps.tenantId, id),
          renderPdf: renderPaymentReceiptPdf,
          saveFile: savePaymentReceiptToTempFile,
          print: printFile,
        });
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.print.printCustomerStatement,
    withError(async (_event, raw: unknown): Promise<CustomerStatementPrintOutcome> => {
      const input = CustomerStatementInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const kysely = createKyselyDb(db);
        return await printCustomerStatementSafely(input.customerId, input.fromDate, input.toDate, {
          getStatementData: (customerId, fromDate, toDate) =>
            getCustomerStatementData(kysely, deps.tenantId, customerId, fromDate, toDate),
          renderPdf: renderCustomerStatementPdf,
          saveFile: saveCustomerStatementToTempFile,
          print: printFile,
        });
      } finally {
        db.close();
      }
    }),
  );
}
