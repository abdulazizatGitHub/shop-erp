import { ipcMain } from 'electron';
import { CreateInternalTransferInput, type NewInternalTransferResult } from '@shop/contracts';
import { createInternalTransfer } from '@shop/core';
import { createKyselyDb, KyselyInternalTransferRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface InternalTransferHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerInternalTransferHandlers(deps: InternalTransferHandlerDeps): void {
  ipcMain.handle(
    channels.job.createInternalTransfer,
    withError(async (_event, raw: unknown): Promise<NewInternalTransferResult> => {
      const input = CreateInternalTransferInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyInternalTransferRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await createInternalTransfer(repo, input);
      } finally {
        db.close();
      }
    }),
  );
}
