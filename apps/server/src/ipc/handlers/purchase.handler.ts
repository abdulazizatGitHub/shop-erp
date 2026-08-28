import { ipcMain } from 'electron';
import { CreatePurchaseInput, PurchaseIdInput } from '@shop/contracts';
import { createKyselyDb, KyselyPurchaseRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface PurchaseHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export interface CreatePurchaseResult {
  readonly id: string;
  readonly docNo: string;
  readonly totalAmountPaisa: number;
}

export function registerPurchaseHandlers(deps: PurchaseHandlerDeps): void {
  ipcMain.handle(
    channels.purchase.create,
    withError(async (_event, raw: unknown): Promise<CreatePurchaseResult> => {
      const input = CreatePurchaseInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPurchaseRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.createPurchase(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.purchase.cancel,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = PurchaseIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPurchaseRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        await repo.cancelPurchase(input.id);
      } finally {
        db.close();
      }
    }),
  );
}
