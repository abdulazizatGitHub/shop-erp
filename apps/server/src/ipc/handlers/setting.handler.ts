import { ipcMain } from 'electron';
import { SetReceiptPaperSizeInput, SetShopNameInput } from '@shop/contracts';
import {
  createKyselyDb,
  getReceiptPaperSize,
  getShopName,
  openDatabase,
  setReceiptPaperSize,
  setShopName,
  type ReceiptPaperSize,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface SettingHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

export function registerSettingHandlers(deps: SettingHandlerDeps): void {
  ipcMain.handle(
    channels.setting.getReceiptPaperSize,
    withError(async (): Promise<ReceiptPaperSize> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getReceiptPaperSize(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setReceiptPaperSize,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetReceiptPaperSizeInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setReceiptPaperSize(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.getShopName,
    withError(async (): Promise<string> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getShopName(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setShopName,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetShopNameInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setShopName(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );
}
