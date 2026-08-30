import { ipcMain } from 'electron';
import {
  CancelSaleInput,
  CreateSaleInput,
  SaleIdInput,
  SaleSearchInput,
  type SaleSummaryDto,
} from '@shop/contracts';
import type { SaleRecord } from '@shop/core';
import {
  createKyselyDb,
  getReceiptPaperSize,
  getSaleReceiptData,
  getShopName,
  KyselySaleRepository,
  openDatabase,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';
import {
  createSaleAndPrintReceipt,
  type CreateSaleAndPrintResult,
} from '../../printing/create-sale-and-print.js';
import { printReceiptForSale } from '../../printing/print-receipt.js';
import { printFile } from '../../printing/print-file.js';
import { renderReceiptPdf } from '../../printing/receipt-pdf.js';
import { saveReceiptToTempFile } from '../../printing/receipt-file.js';

export interface SaleHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export function registerSaleHandlers(deps: SaleHandlerDeps): void {
  ipcMain.handle(
    channels.sale.create,
    withError(async (_event, raw: unknown): Promise<CreateSaleAndPrintResult> => {
      const input = CreateSaleInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const kysely = createKyselyDb(db);
        const repo = new KyselySaleRepository(kysely, deps.tenantId, deps.deviceCode);

        // Print-after-commit (docs/SYSTEM_DESIGN.md section 8): a print
        // failure must never roll back or hide the sale — see
        // createSaleAndPrintReceipt's own contract. Same open connection
        // reused for the post-commit reads; the sale's own transaction
        // has already committed by the time repo.createSale() returns.
        return await createSaleAndPrintReceipt(
          () => repo.createSale(input),
          (saleId) =>
            printReceiptForSale(saleId, {
              getSaleData: (id) => getSaleReceiptData(kysely, deps.tenantId, id),
              getShopName: () => getShopName(kysely, deps.tenantId),
              getPageSize: () => getReceiptPaperSize(kysely, deps.tenantId),
              renderPdf: renderReceiptPdf,
              saveFile: saveReceiptToTempFile,
              print: printFile,
            }),
        );
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.sale.cancel,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = CancelSaleInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselySaleRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        await repo.cancelSale(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.sale.getById,
    withError(async (_event, raw: unknown): Promise<SaleRecord | null> => {
      const input = SaleIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselySaleRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getSaleById(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.sale.listByDate,
    withError(async (_event, raw: unknown): Promise<readonly SaleSummaryDto[]> => {
      const input = SaleSearchInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselySaleRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.listSalesByDate(input);
      } finally {
        db.close();
      }
    }),
  );
}
