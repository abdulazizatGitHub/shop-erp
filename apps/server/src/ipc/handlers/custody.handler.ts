import { ipcMain } from 'electron';
import {
  RecordCustodyReconciliationInput,
  type CustodyReconciliationResult,
} from '@shop/contracts';
import { recordCustodyReconciliation } from '@shop/core';
import { createKyselyDb, KyselyCustodyRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface CustodyHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerCustodyHandlers(deps: CustodyHandlerDeps): void {
  ipcMain.handle(
    channels.job.reconcileCustody,
    withError(async (_event, raw: unknown): Promise<CustodyReconciliationResult> => {
      const input = RecordCustodyReconciliationInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCustodyRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await recordCustodyReconciliation(repo, input);
      } finally {
        db.close();
      }
    }),
  );
}
