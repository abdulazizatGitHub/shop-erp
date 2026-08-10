/**
 * Forward-only migration runner. See docs/DATABASE_RULES.md section 4.
 *
 * The `checksum` column on `schema_migration` is not part of 0001_init.sql —
 * that file is frozen (CLAUDE.md: never edit an applied migration). This
 * runner bootstraps the column onto its own bookkeeping table itself, the
 * first time it needs it, so a changed migration file can still be detected
 * without touching the numbered .sql files.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { openDatabase } from './connection.js';

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface MigrateResult {
  readonly backupPath: string | null;
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

const MIGRATION_FILE_PATTERN = /^(\d{4})_.+\.sql$/;

export function discoverMigrations(migrationsDir: string): MigrationFile[] {
  const files = readdirSync(migrationsDir)
    .filter((file) => MIGRATION_FILE_PATTERN.test(file))
    .sort();

  return files.map((file) => {
    const match = MIGRATION_FILE_PATTERN.exec(file);
    const versionGroup = match?.[1];
    if (versionGroup === undefined) {
      throw new Error(`Could not parse a version number from migration filename: ${file}`);
    }
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    return { version: Number.parseInt(versionGroup, 10), name: file, sql, checksum };
  });
}

function backupDatabaseFile(dbPath: string, backupDir: string): string {
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `pre-migrate-${stamp}.db`);
  copyFileSync(dbPath, backupPath);
  return backupPath;
}

interface SchemaMigrationRow {
  version: number;
  name: string;
  applied_at: string;
  checksum: string | null;
}

function schemaMigrationTableExists(db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'`,
    )
    .get() as { found: number } | undefined;
  return row !== undefined;
}

/** Idempotent: adds the checksum column to schema_migration if it is not already there. */
function ensureChecksumColumn(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(schema_migration)`).all() as Array<{
    name: string;
  }>;
  const hasChecksum = columns.some((column) => column.name === 'checksum');
  if (!hasChecksum) {
    db.exec(`ALTER TABLE schema_migration ADD COLUMN checksum TEXT`);
  }
}

function getAppliedRow(db: Database.Database, version: number): SchemaMigrationRow | undefined {
  if (!schemaMigrationTableExists(db)) return undefined;
  ensureChecksumColumn(db);
  return db
    .prepare(`SELECT version, name, applied_at, checksum FROM schema_migration WHERE version = ?`)
    .get(version) as SchemaMigrationRow | undefined;
}

/**
 * Applies every pending migration in `migrationsDir` to the database at
 * `dbPath`, in version order, each inside its own transaction. Backs up the
 * database file before touching it, if the file already exists. Refuses to
 * run if an already-applied migration's on-disk content no longer matches
 * the checksum recorded when it was applied.
 */
export function migrate(dbPath: string, migrationsDir: string, backupDir: string): MigrateResult {
  const preExisting = existsSync(dbPath);
  const backupPath = preExisting ? backupDatabaseFile(dbPath, backupDir) : null;

  const db = openDatabase(dbPath);
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    const migrations = discoverMigrations(migrationsDir);

    for (const migration of migrations) {
      const appliedRow = getAppliedRow(db, migration.version);

      if (appliedRow) {
        if (appliedRow.checksum !== null && appliedRow.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.name} (version ${String(migration.version)}) has changed on ` +
              `disk since it was applied. Recorded checksum: ${appliedRow.checksum}. Current ` +
              `checksum: ${migration.checksum}. Refusing to run — never edit an applied ` +
              `migration; write a new one instead.`,
          );
        }
        skipped.push(migration.name);
        continue;
      }

      const applyOne = db.transaction(() => {
        db.exec(migration.sql);
        ensureChecksumColumn(db);
        db.prepare(
          `INSERT INTO schema_migration (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)`,
        ).run(migration.version, migration.name, new Date().toISOString(), migration.checksum);
      });
      applyOne();
      applied.push(migration.name);
    }
  } finally {
    db.close();
  }

  return { backupPath, applied, skipped };
}
