import { ipcMain } from 'electron';
import { UpdateJobDiagnosisInput, type JobDto } from '@shop/contracts';
import { updateJobDiagnosis } from '@shop/core';
import { createKyselyDb, KyselyJobDiagnosisRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobDiagnosisHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerJobDiagnosisHandlers(deps: JobDiagnosisHandlerDeps): void {
  ipcMain.handle(
    channels.job.updateDiagnosis,
    withError(async (_event, raw: unknown): Promise<JobDto> => {
      const input = UpdateJobDiagnosisInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobDiagnosisRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await updateJobDiagnosis(repo, input);
      } finally {
        db.close();
      }
    }),
  );
}
