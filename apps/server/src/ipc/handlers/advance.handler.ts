import { ipcMain } from 'electron';
import { ListAdvancesInput, RecordAdvanceInput, type AdvanceDto } from '@shop/contracts';
import { listAdvances, recordAdvance } from '@shop/core';
import { createKyselyDb, KyselyAdvanceRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface AdvanceHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See staff.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerAdvanceHandlers(deps: AdvanceHandlerDeps): void {
  ipcMain.handle(
    channels.staff.recordAdvance,
    withError(async (_event, raw: unknown): Promise<AdvanceDto> => {
      const input = RecordAdvanceInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyAdvanceRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await recordAdvance(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.staff.listAdvances,
    withError(async (_event, raw: unknown): Promise<readonly AdvanceDto[]> => {
      const input = ListAdvancesInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyAdvanceRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await listAdvances(repo, input);
      } finally {
        db.close();
      }
    }),
  );
}
