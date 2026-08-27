import { ipcMain } from 'electron';
import {
  CancelSaleInput,
  CreateSaleInput,
  SaleIdInput,
  SaleSearchInput,
  type SaleResult,
  type SaleSummaryDto,
} from '@shop/contracts';
import type { SaleRecord } from '@shop/core';
import { createKyselyDb, KyselySaleRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface SaleHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export function registerSaleHandlers(deps: SaleHandlerDeps): void {
  ipcMain.handle(
    channels.sale.create,
    withError(async (_event, raw: unknown): Promise<SaleResult> => {
      const input = CreateSaleInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselySaleRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.createSale(input);
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
