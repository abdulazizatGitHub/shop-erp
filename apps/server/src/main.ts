import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { migrate, openDatabase, seed } from '@shop/db';
import { channels } from './ipc/channels.js';
import { registerItemHandlers } from './ipc/handlers/item.handler.js';
import { registerCustomerHandlers } from './ipc/handlers/customer.handler.js';
import { registerSupplierHandlers } from './ipc/handlers/supplier.handler.js';
import { registerPurchaseHandlers } from './ipc/handlers/purchase.handler.js';
import { registerSaleHandlers } from './ipc/handlers/sale.handler.js';
import { registerPaymentHandlers } from './ipc/handlers/payment.handler.js';
import { registerImportHandlers } from './ipc/handlers/import.handler.js';
import { registerSupplierBalanceImportHandlers } from './ipc/handlers/supplier-balance-import.handler.js';
import { registerCustomerBalanceImportHandlers } from './ipc/handlers/customer-balance-import.handler.js';
import { registerBackupHandlers } from './ipc/handlers/backup.handler.js';
import { registerSettingHandlers } from './ipc/handlers/setting.handler.js';
import { registerPrintHandlers } from './ipc/handlers/print.handler.js';
import { registerInvoiceHandlers } from './ipc/handlers/invoice.handler.js';

// CLAUDE.md 3.5: tenant_id is a constant in local mode. Matches
// .env.example's TENANT_ID so a fresh dev DB and a packaged install agree.
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_DEVICE_CODE = 'A';

function resolveTenantId(): string {
  return process.env['TENANT_ID'] ?? DEFAULT_TENANT_ID;
}

function resolveDeviceCode(): string {
  return process.env['DEVICE_CODE'] ?? DEFAULT_DEVICE_CODE;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// currentDir at runtime is dist/main (see electron.vite.config.ts) — four
// levels up is the repo root. Used to make dev-mode paths absolute instead
// of relative to whatever process.cwd() happens to be (already bit us once
// for the migrations dir; the same class of bug for DATABASE_PATH/BACKUP_DIR
// just hadn't been noticed yet).
const repoRootDev = path.join(currentDir, '../../../../');

// docs/SYSTEM_DESIGN.md section 9: data lives under the OS app-data
// directory, never inside the install directory. "ShopERP" (no space)
// matches the doc's %APPDATA%\ShopERP\ layout.
app.setName('ShopERP');

function resolveDbPath(): string {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'shop.db');
  return path.resolve(repoRootDev, process.env['DATABASE_PATH'] ?? './data/shop-dev.db');
}

function resolveBackupDir(): string {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'backups');
  return path.resolve(repoRootDev, process.env['BACKUP_DIR'] ?? './backups');
}

function resolveLogDir(): string {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'logs');
  return path.resolve(repoRootDev, process.env['LOG_DIR'] ?? './logs');
}

function resolveMigrationsDir(): string {
  // Packaged: copied to resources/migrations via extraResources (see
  // apps/server/package.json "build") — not inside app.asar.
  if (app.isPackaged) return path.join(process.resourcesPath, 'migrations');
  // Dev: relative to this file's own location, not process.cwd() — cwd is
  // apps/server when launched via `npm run dev --workspace=@shop/server`,
  // not the repo root, which silently pointed at the wrong directory.
  return path.join(repoRootDev, 'packages/db/src/migrations');
}

function registerIpcHandlers(dbPath: string): void {
  const tenantId = resolveTenantId();
  const deviceCode = resolveDeviceCode();
  registerItemHandlers({ dbPath, tenantId, deviceCode });
  registerCustomerHandlers({ dbPath, tenantId, deviceCode });
  registerSupplierHandlers({ dbPath, tenantId, deviceCode });
  registerPurchaseHandlers({ dbPath, tenantId, deviceCode });
  registerSaleHandlers({ dbPath, tenantId, deviceCode });
  registerPaymentHandlers({ dbPath, tenantId, deviceCode });
  registerImportHandlers({ dbPath, tenantId, deviceCode, logDir: resolveLogDir() });
  registerSupplierBalanceImportHandlers({ dbPath, tenantId, deviceCode, logDir: resolveLogDir() });
  registerCustomerBalanceImportHandlers({ dbPath, tenantId, deviceCode, logDir: resolveLogDir() });
  registerBackupHandlers({ dbPath, defaultBackupDir: resolveBackupDir() });
  registerSettingHandlers({ dbPath, tenantId });
  registerPrintHandlers({ dbPath, tenantId });
  registerInvoiceHandlers({ dbPath, tenantId });

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

  // Startup smoke check — a blank window must never be silently reported
  // as success. did-fail-load is exactly what fired the first time this
  // was wired wrong (loadFile against a URL that only exists in prod).
  win.webContents.on('did-finish-load', () => {
    console.warn('Renderer loaded OK');
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('RENDERER FAILED TO LOAD', { errorCode, errorDescription, validatedURL });
  });

  // Dev-only DevTools shortcut — no application menu for a shopkeeper to
  // accidentally click into (see Menu.setApplicationMenu(null) below).
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        win.webContents.toggleDevTools();
      }
    });
  }

  // electron-vite dev serves the renderer from its own Vite dev server —
  // it is never written to disk as dist/renderer/index.html the way main
  // and preload are. Packaged builds have no dev server; loadFile is the
  // only option there.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  const loaded =
    !app.isPackaged && devServerUrl
      ? win.loadURL(devServerUrl)
      : win.loadFile(path.join(currentDir, '../renderer/index.html'));
  loaded.catch((error: unknown) => {
    console.error('Failed to load renderer:', error);
  });
}

app
  .whenReady()
  .then(() => {
    Menu.setApplicationMenu(null);
    const dbPath = resolveDbPath();
    const migrationsDir = resolveMigrationsDir();
    console.warn('Database path:', dbPath);
    console.warn('Migrations dir:', migrationsDir);
    migrate(dbPath, migrationsDir, resolveBackupDir());
    const seedDb = openDatabase(dbPath);
    try {
      const seedResult = seed(seedDb, resolveTenantId());
      console.warn('Seed result:', JSON.stringify(seedResult));
    } finally {
      seedDb.close();
    }
    registerIpcHandlers(dbPath);
    createWindow();
  })
  .catch((error: unknown) => {
    console.error('Failed to start:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  app.quit();
});
