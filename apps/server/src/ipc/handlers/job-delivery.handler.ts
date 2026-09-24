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

/**
 * P16-3a Checkpoint 2 (ADR-0015) retires Phase 7's separate, swallowed
 * commission-recording step entirely — commission claims are now
 * inserted INSIDE deliverJob's own transaction
 * (job-delivery.repository.ts), so a claim failure rolls back the whole
 * delivery. Nothing extra runs here after deliverJob returns.
 */
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
