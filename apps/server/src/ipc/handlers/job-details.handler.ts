import { ipcMain } from 'electron';
import { UpdateJobDetailsInput, type JobDto } from '@shop/contracts';
import { updateJobDetails } from '@shop/core';
import { createKyselyDb, KyselyJobDetailsRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobDetailsHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** I4/BUG-17 (partial). See job.handler.ts's file header — no
 * requirePermission() (PROJECT.md BUG-ADR9). */
export function registerJobDetailsHandlers(deps: JobDetailsHandlerDeps): void {
  ipcMain.handle(
    channels.job.updateDetails,
    withError(async (_event, raw: unknown): Promise<JobDto> => {
      const input = UpdateJobDetailsInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobDetailsRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await updateJobDetails(repo, input);
      } finally {
        db.close();
      }
    }),
  );
}
