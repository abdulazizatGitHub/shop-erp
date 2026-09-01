import { dialog, ipcMain } from 'electron';
import { createBackup, pruneBackups, restoreBackup } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';
import { setRestoreInProgress } from '../middleware/restore-state.js';

// docs/DATABASE_RULES.md section 7: keep the last 30 daily backups.
const MAX_BACKUPS = 30;

export interface BackupHandlerDeps {
  readonly dbPath: string;
  readonly defaultBackupDir: string;
}

export interface BackupNowResult {
  readonly backupPath: string;
  readonly sizeBytes: number;
}

export interface RestoreResult {
  readonly restoredFrom: string;
}

export function registerBackupHandlers(deps: BackupHandlerDeps): void {
  ipcMain.handle(
    channels.backup.now,
    withError(async (): Promise<BackupNowResult | null> => {
      const picked = await dialog.showOpenDialog({
        title: 'Choose a folder to save the backup',
        defaultPath: deps.defaultBackupDir,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (picked.canceled || picked.filePaths.length === 0) return null;
      const chosenDir = picked.filePaths[0];
      if (chosenDir === undefined) return null;

      const result = await createBackup(deps.dbPath, chosenDir);
      pruneBackups(chosenDir, MAX_BACKUPS);
      return result;
    }),
  );

  ipcMain.handle(
    channels.backup.restore,
    withError(async (): Promise<RestoreResult | null> => {
      const picked = await dialog.showOpenDialog({
        title: 'Choose a backup file to restore',
        defaultPath: deps.defaultBackupDir,
        properties: ['openFile'],
        filters: [{ name: 'ShopERP backup', extensions: ['db'] }],
      });
      if (picked.canceled || picked.filePaths.length === 0) return null;
      const backupPath = picked.filePaths[0];
      if (backupPath === undefined) return null;

      // P4.5 improvement 3: the native confirm dialog that used to sit
      // here is gone — the renderer's own ConfirmDialog ("Restore from
      // backup?") is the sole confirmation gate now, no more double-gate.
      // The native file picker above stays: it's how the caller specifies
      // *which* backup file to restore — there's no other source for that
      // path (no client-side file browsing, nothing stored client-side).
      //
      // See restore-state.ts / with-error.ts: no persistent connection to
      // close here — this flag blocks every withError-wrapped handler
      // from opening a new connection while the copy below is in flight.
      setRestoreInProgress(true);
      try {
        restoreBackup(backupPath, deps.dbPath);
      } finally {
        setRestoreInProgress(false);
      }
      return { restoredFrom: backupPath };
    }),
  );
}
