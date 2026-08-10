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

const migrationsDir = path.join(currentDir, 'migrations');
const result = migrate(resolveDbPath(), migrationsDir, resolveBackupDir());

console.warn(`Backup: ${result.backupPath ?? '(none — database did not exist yet)'}`);
console.warn(`Applied: ${result.applied.length > 0 ? result.applied.join(', ') : '(none)'}`);
console.warn(
  `Already applied (skipped): ${result.skipped.length > 0 ? result.skipped.join(', ') : '(none)'}`,
);
