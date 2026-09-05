import { ipcMain } from 'electron';
import {
  IssuePartsToJobInput,
  IssuePartsToTechnicianInput,
  JobIdInput,
  type IssuePartsToJobResult,
  type IssuePartsToTechnicianResult,
} from '@shop/contracts';
import { issuePartsToJob, issuePartsToTechnician } from '@shop/core';
import type { JobPartRecord } from '@shop/core';
import { createKyselyDb, KyselyJobPartRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobIssueHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerJobIssueHandlers(deps: JobIssueHandlerDeps): void {
  ipcMain.handle(
    channels.job.issueToTechnician,
    withError(async (_event, raw: unknown): Promise<IssuePartsToTechnicianResult> => {
      const input = IssuePartsToTechnicianInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobPartRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await issuePartsToTechnician(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.issueToJob,
    withError(async (_event, raw: unknown): Promise<IssuePartsToJobResult> => {
      const input = IssuePartsToJobInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobPartRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await issuePartsToJob(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.listJobParts,
    withError(async (_event, raw: unknown): Promise<readonly JobPartRecord[]> => {
      const input = JobIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobPartRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.listJobParts(input.id);
      } finally {
        db.close();
      }
    }),
  );
}
