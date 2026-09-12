import { ipcMain } from 'electron';
import { CreatePurchaseOrderInput, PurchaseOrderIdInput } from '@shop/contracts';
import type { PurchaseOrderRecord, PurchaseOrderSummary } from '@shop/core';
import { createKyselyDb, KyselyPurchaseOrderRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface PurchaseOrderHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export interface CreatePurchaseOrderResult {
  readonly id: string;
  readonly docNo: string;
}

export function registerPurchaseOrderHandlers(deps: PurchaseOrderHandlerDeps): void {
  ipcMain.handle(
    channels.purchaseOrder.create,
    withError(async (_event, raw: unknown): Promise<CreatePurchaseOrderResult> => {
      const input = CreatePurchaseOrderInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPurchaseOrderRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.create(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.purchaseOrder.get,
    withError(async (_event, raw: unknown): Promise<PurchaseOrderRecord | null> => {
      const input = PurchaseOrderIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPurchaseOrderRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.get(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.purchaseOrder.list,
    withError(async (): Promise<readonly PurchaseOrderSummary[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPurchaseOrderRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.list();
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.purchaseOrder.cancel,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = PurchaseOrderIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPurchaseOrderRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        await repo.cancel(input.id);
      } finally {
        db.close();
      }
    }),
  );
}
