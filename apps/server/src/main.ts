import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { migrate, openDatabase } from '@shop/db';
import { channels } from './ipc/channels.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// docs/SYSTEM_DESIGN.md section 9: data lives under the OS app-data
// directory, never inside the install directory. "ShopERP" (no space)
// matches the doc's %APPDATA%\ShopERP\ layout.
app.setName('ShopERP');

function resolveDbPath(): string {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'shop.db');
  return process.env['DATABASE_PATH'] ?? './data/shop-dev.db';
}

function resolveBackupDir(): string {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'backups');
  return process.env['BACKUP_DIR'] ?? './backups';
}

function resolveMigrationsDir(): string {
  // Packaged: copied to resources/migrations via extraResources (see
  // apps/server/package.json "build") — not inside app.asar.
  if (app.isPackaged) return path.join(process.resourcesPath, 'migrations');
  // Dev: relative to this file's own location, not process.cwd() — cwd is
  // apps/server when launched via `npm run dev --workspace=@shop/server`,
  // not the repo root, which silently pointed at the wrong directory.
  return path.join(currentDir, '../../../../packages/db/src/migrations');
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
    const dbPath = resolveDbPath();
    const migrationsDir = resolveMigrationsDir();
    console.warn('Database path:', dbPath);
    console.warn('Migrations dir:', migrationsDir);
    migrate(dbPath, migrationsDir, resolveBackupDir());
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
