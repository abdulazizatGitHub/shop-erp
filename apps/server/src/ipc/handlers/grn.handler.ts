import { ipcMain } from 'electron';
import { CreateGrnInput, GrnIdInput, GrnListForPurchaseOrderInput } from '@shop/contracts';
import type { GrnRecord, GrnSummary } from '@shop/core';
import { createKyselyDb, KyselyGrnRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface GrnHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export interface CreateGrnResult {
  readonly id: string;
  readonly docNo: string;
}

export function registerGrnHandlers(deps: GrnHandlerDeps): void {
  ipcMain.handle(
    channels.grn.create,
    withError(async (_event, raw: unknown): Promise<CreateGrnResult> => {
      const input = CreateGrnInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.create(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.grn.get,
    withError(async (_event, raw: unknown): Promise<GrnRecord | null> => {
      const input = GrnIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.get(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.grn.listForPO,
    withError(async (_event, raw: unknown): Promise<readonly GrnSummary[]> => {
      const input = GrnListForPurchaseOrderInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.listForPurchaseOrder(input.purchaseOrderId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.grn.cancel,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = GrnIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        await repo.cancel(input.id);
      } finally {
        db.close();
      }
    }),
  );
}
