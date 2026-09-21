import { ipcMain } from 'electron';
import {
  CreateJobClientInput,
  JobClientIdInput,
  SearchJobClientsInput,
  type JobClientDto,
} from '@shop/contracts';
import { createKyselyDb, KyselyJobClientRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobClientHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/** Same direct-repository pattern as customer.handler.ts — no core service
 * wrapper, since search/create/getById carry no domain logic beyond the
 * Zod validation already done here. See job.handler.ts's file header —
 * no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerJobClientHandlers(deps: JobClientHandlerDeps): void {
  ipcMain.handle(
    channels.jobClient.search,
    withError(async (_event, raw: unknown): Promise<readonly JobClientDto[]> => {
      const input = SearchJobClientsInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobClientRepository(createKyselyDb(db), deps.tenantId);
        return await repo.searchJobClients(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.jobClient.create,
    withError(async (_event, raw: unknown): Promise<JobClientDto> => {
      const input = CreateJobClientInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobClientRepository(createKyselyDb(db), deps.tenantId);
        return await repo.createJobClient(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.jobClient.getById,
    withError(async (_event, raw: unknown): Promise<JobClientDto | null> => {
      const input = JobClientIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyJobClientRepository(createKyselyDb(db), deps.tenantId);
        return await repo.getJobClientById(input.id);
      } finally {
        db.close();
      }
    }),
  );
}
