import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { migrate, openDatabase } from '@shop/db';
import { channels } from './ipc/channels.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  return process.env['DATABASE_PATH'] ?? './data/shop-dev.db';
}

function resolveBackupDir(): string {
  return process.env['BACKUP_DIR'] ?? './backups';
}

function resolveMigrationsDir(): string {
  return path.join(process.cwd(), 'packages/db/src/migrations');
}

function registerIpcHandlers(): void {
  ipcMain.handle(channels.system.ping, () => {
    const db = openDatabase(resolveDbPath());
    try {
      const row = db
        .prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'`)
        .get() as { count: number };
      console.warn('MAIN_PROCESS_IPC_ROUNDTRIP tableCount=' + String(row.count));
      return { tableCount: row.count };
    } finally {
      db.close();
    }
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(currentDir, '../preload/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  void win.loadFile(path.join(currentDir, '../renderer/index.html'));
}

app
  .whenReady()
  .then(() => {
    migrate(resolveDbPath(), resolveMigrationsDir(), resolveBackupDir());
    registerIpcHandlers();
    createWindow();
  })
  .catch((error: unknown) => {
    console.error('Failed to start:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  app.quit();
});
