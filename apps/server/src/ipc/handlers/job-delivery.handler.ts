import { ipcMain } from 'electron';
import { DeliverJobInput, type DeliverJobResult } from '@shop/contracts';
import { deliverJob } from '@shop/core';
import { createKyselyDb, KyselyJobDeliveryRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobDeliveryHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerJobDeliveryHandlers(deps: JobDeliveryHandlerDeps): void {
  ipcMain.handle(
    channels.job.deliver,
    withError(async (_event, raw: unknown): Promise<DeliverJobResult> => {
      const input = DeliverJobInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobDeliveryRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await deliverJob(repo, input);
      } finally {
        db.close();
      }
    }),
  );
}
