import { ipcMain } from 'electron';
import { SetRowsPerPageInput } from '@shop/contracts';
import {
  createKyselyDb,
  getRowsPerPage,
  openDatabase,
  setRowsPerPage,
  type RowsPerPage,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface ReportsDisplaySettingHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/**
 * P17-3 (docs/phases/PHASE_17.md §2.5). Own file, same convention as
 * stock-alerts-setting.handler.ts — a thin withError-wrapped,
 * open/close-per-call pair.
 */
export function registerReportsDisplaySettingHandlers(
  deps: ReportsDisplaySettingHandlerDeps,
): void {
  ipcMain.handle(
    channels.setting.getRowsPerPage,
    withError(async (): Promise<RowsPerPage> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getRowsPerPage(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setRowsPerPage,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetRowsPerPageInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setRowsPerPage(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );
}
