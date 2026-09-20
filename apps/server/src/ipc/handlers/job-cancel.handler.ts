import { ipcMain } from 'electron';
import { CancelJobInput, type JobDto } from '@shop/contracts';
import { cancelJob } from '@shop/core';
import { createKyselyDb, KyselyJobCancelRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobCancelHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerJobCancelHandlers(deps: JobCancelHandlerDeps): void {
  ipcMain.handle(
    channels.job.cancelJob,
    withError(async (_event, raw: unknown): Promise<JobDto> => {
      const input = CancelJobInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobCancelRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await cancelJob(repo, input);
      } finally {
        db.close();
      }
    }),
  );
}
