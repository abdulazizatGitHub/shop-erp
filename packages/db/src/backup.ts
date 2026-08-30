/**
 * Backup/restore/retention for the SQLite database file.
 * See docs/phases/PHASE_4.md CF-7 — unencrypted by deliberate decision,
 * not an oversight. Encryption deferred to Phase 8 pending owner request.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { openDatabase } from './connection.js';

export interface CreateBackupResult {
  readonly backupPath: string;
  readonly sizeBytes: number;
}

const BACKUP_FILENAME_PATTERN = /^ShopERP_backup_\d{4}-\d{2}-\d{2}\.db$/;

function formatBackupFilename(date: Date): string {
  const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return `ShopERP_backup_${iso}.db`;
}

/**
 * Copies the live database into backupDir as ShopERP_backup_YYYY-MM-DD.db,
 * using SQLite's own Online Backup API (better-sqlite3's db.backup()) —
 * NOT a plain file copy. The live database runs in WAL mode
 * (docs/DATABASE_RULES.md section 1): a committed transaction can sit in
 * the .db-wal sidecar file, not yet checkpointed into the main .db file.
 * A raw copyFileSync of just dbPath would silently omit any such
 * transaction. db.backup() reads through the connection at the SQLite
 * page level and always produces a complete, consistent single file,
 * regardless of WAL/checkpoint state. A second backup on the same day
 * overwrites the first — "daily backups" per docs/DATABASE_RULES.md
 * section 7 means one file per day, not one per click.
 */
export async function createBackup(
  dbPath: string,
  backupDir: string,
  now: Date = new Date(),
): Promise<CreateBackupResult> {
  mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, formatBackupFilename(now));

  const db = openDatabase(dbPath);
  try {
    await db.backup(backupPath);
  } finally {
    db.close();
  }

  const sizeBytes = statSync(backupPath).size;
  return { backupPath, sizeBytes };
}

/**
 * Deletes the oldest ShopERP_backup_*.db files in backupDir until at
 * most maxCount remain. Filenames sort lexicographically in date order
 * (YYYY-MM-DD), so a plain string sort is enough to find the oldest —
 * no mtime read needed. Files not matching the backup filename pattern
 * (e.g. migration-runner's own pre-migrate-*.db copies) are never
 * touched or counted.
 */
export function pruneBackups(backupDir: string, maxCount: number): string[] {
  if (!existsSync(backupDir)) return [];

  const files = readdirSync(backupDir)
    .filter((file) => BACKUP_FILENAME_PATTERN.test(file))
    .sort();

  const excess = files.length - maxCount;
  if (excess <= 0) return [];

  const toDelete = files.slice(0, excess);
  const deletedPaths: string[] = [];
  for (const file of toDelete) {
    const filePath = path.join(backupDir, file);
    unlinkSync(filePath);
    deletedPaths.push(filePath);
  }
  return deletedPaths;
}

/**
 * Copies a backup file over the live database path. Caller is
 * responsible for closing any open connection to targetDbPath before
 * calling this, and reopening one afterward — this function only
 * knows about files, never about connection lifecycle (that lives in
 * apps/server, which owns the live connection).
 */
export function restoreBackup(backupPath: string, targetDbPath: string): void {
  mkdirSync(path.dirname(targetDbPath), { recursive: true });
  copyFileSync(backupPath, targetDbPath);
}
