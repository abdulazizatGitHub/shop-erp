import { ipcMain } from 'electron';
import { SetDefaultLowStockThresholdInput, SetNegativeStockPolicyInput } from '@shop/contracts';
import {
  createKyselyDb,
  getDefaultLowStockThresholdMilli,
  getNegativeStockPolicy,
  openDatabase,
  setDefaultLowStockThresholdMilli,
  setNegativeStockPolicy,
  type NegativeStockPolicy,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface StockAlertsSettingHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/**
 * P17-1/P17-2 (docs/phases/PHASE_17.md §2.1/§2.2). Extracted out of
 * setting.handler.ts once it crossed the 300-line convention — same
 * withError-wrapped, open/close-per-call pattern as every other setting
 * handler there.
 */
export function registerStockAlertsSettingHandlers(deps: StockAlertsSettingHandlerDeps): void {
  ipcMain.handle(
    channels.setting.getNegativeStockPolicy,
    withError(async (): Promise<NegativeStockPolicy> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getNegativeStockPolicy(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setNegativeStockPolicy,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetNegativeStockPolicyInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setNegativeStockPolicy(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.getDefaultLowStockThreshold,
    withError(async (): Promise<number> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getDefaultLowStockThresholdMilli(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setDefaultLowStockThreshold,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetDefaultLowStockThresholdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setDefaultLowStockThresholdMilli(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );
}
