import { ipcMain } from 'electron';
import {
  AssignTechnicianInput,
  CreateJobInput,
  JobIdInput,
  JobSearchInput,
  JobStatusTransitionInput,
  TechnicianCustodyInput,
  type JobDto,
  type JobSummaryDto,
} from '@shop/contracts';
import { assignTechnician, createJob, transitionJobStatus } from '@shop/core';
import type { JobSplitRecord, TechnicianCustodyRecord } from '@shop/core';
import {
  createKyselyDb,
  KyselyJobRepository,
  listServiceCharges,
  listTechnicians,
  openDatabase,
  type ServiceChargeOption,
  type TechnicianOption,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/**
 * No requirePermission() call in any handler here — see PROJECT.md
 * BUG-ADR9. No permission-enforcement infrastructure exists anywhere in
 * this codebase yet (sale.handler.ts and every other handler have zero
 * checks too); adding one only for job.* would create an inconsistency
 * where the most sensitive operations (createSale, cancelPurchase) stay
 * unchecked while job intake gets a stub. Owner decision, 2026-09-04.
 */
export function registerJobHandlers(deps: JobHandlerDeps): void {
  ipcMain.handle(
    channels.job.create,
    withError(async (_event, raw: unknown): Promise<JobDto> => {
      const input = CreateJobInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await createJob(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.assignTechnician,
    withError(async (_event, raw: unknown): Promise<JobDto> => {
      const input = AssignTechnicianInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await assignTechnician(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.transitionStatus,
    withError(async (_event, raw: unknown): Promise<JobDto> => {
      const input = JobStatusTransitionInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await transitionJobStatus(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.getById,
    withError(async (_event, raw: unknown): Promise<JobDto | null> => {
      const input = JobIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getJob(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.list,
    withError(async (_event, raw: unknown): Promise<readonly JobSummaryDto[]> => {
      const input = JobSearchInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.listJobs(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.getJobSplit,
    withError(async (_event, raw: unknown): Promise<JobSplitRecord | null> => {
      const input = JobIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getJobSplit(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.getTechnicianCustody,
    withError(async (_event, raw: unknown): Promise<readonly TechnicianCustodyRecord[]> => {
      const input = TechnicianCustodyInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getTechnicianCustody(input.technicianPartyId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.listTechnicians,
    withError(async (): Promise<readonly TechnicianOption[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await listTechnicians(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.listServiceCharges,
    withError(async (): Promise<readonly ServiceChargeOption[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await listServiceCharges(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );
}
