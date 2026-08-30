import { ipcMain } from 'electron';
import { SaleIdInput } from '@shop/contracts';
import { createKyselyDb, getSaleInvoiceData, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';
import {
  printInvoiceSafely,
  type InvoicePrintOutcome,
} from '../../printing/print-invoice-safely.js';
import { printFile } from '../../printing/print-file.js';
import { renderInvoicePdf } from '../../printing/invoice-pdf.js';
import { saveInvoiceToTempFile } from '../../printing/invoice-file.js';

export interface InvoiceHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/**
 * P4-2. "Print Invoice" — a deliberate button click after a sale
 * already exists (not print-after-commit). Same error-isolation
 * contract as the receipt: printInvoiceSafely never throws for a print
 * failure, always returns { filePath, printError }. Zod validation
 * failures at the boundary still fail normally via withError — that's
 * a caller-input error, not a print failure.
 */
export function registerInvoiceHandlers(deps: InvoiceHandlerDeps): void {
  ipcMain.handle(
    channels.invoice.printSaleInvoice,
    withError(async (_event, raw: unknown): Promise<InvoicePrintOutcome> => {
      const input = SaleIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const kysely = createKyselyDb(db);
        return await printInvoiceSafely(input.id, {
          getInvoiceData: (id) => getSaleInvoiceData(kysely, deps.tenantId, id),
          renderPdf: renderInvoicePdf,
          saveFile: saveInvoiceToTempFile,
          print: printFile,
        });
      } finally {
        db.close();
      }
    }),
  );
}
