import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './migration-runner.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  return process.env['DATABASE_PATH'] ?? './data/shop-dev.db';
}

function resolveBackupDir(): string {
  return process.env['BACKUP_DIR'] ?? './backups';
}

const dbPath = resolveDbPath();
for (const suffix of ['', '-wal', '-shm']) {
  const filePath = dbPath + suffix;
  if (existsSync(filePath)) {
    rmSync(filePath);
    console.warn(`Removed ${filePath}`);
  }
}

const migrationsDir = path.join(currentDir, 'migrations');
const result = migrate(dbPath, migrationsDir, resolveBackupDir());
console.warn(`Rebuilt database at ${dbPath}. Applied: ${result.applied.join(', ')}`);
