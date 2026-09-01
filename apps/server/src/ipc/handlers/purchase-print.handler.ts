import { ipcMain } from 'electron';
import { PurchaseIdInput } from '@shop/contracts';
import { createKyselyDb, getPurchasePrintData, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';
import {
  printPurchaseOrderSafely,
  type PurchasePrintOutcome,
} from '../../printing/print-purchase-safely.js';
import { printFile } from '../../printing/print-file.js';
import { renderPurchasePdf } from '../../printing/purchase-pdf.js';
import { purchaseOrderTempFilePath } from '../../printing/purchase-file.js';

export interface PurchasePrintHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/**
 * P4.5 purchase-order printing. "Print" — a deliberate button click on
 * any row in the Purchases list, cancelled ones included (for records).
 * Same error-isolation contract as invoice.handler.ts's printSaleInvoice:
 * printPurchaseOrderSafely never throws for a print failure, always
 * returns { filePath, printError }.
 */
export function registerPurchasePrintHandlers(deps: PurchasePrintHandlerDeps): void {
  ipcMain.handle(
    channels.purchase.printOrder,
    withError(async (_event, raw: unknown): Promise<PurchasePrintOutcome> => {
      const input = PurchaseIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const kysely = createKyselyDb(db);
        return await printPurchaseOrderSafely(input.id, {
          getPurchasePrintData: (id) => getPurchasePrintData(kysely, deps.tenantId, id),
          renderPdf: renderPurchasePdf,
          computeOutputPath: purchaseOrderTempFilePath,
          print: printFile,
        });
      } finally {
        db.close();
      }
    }),
  );
}
