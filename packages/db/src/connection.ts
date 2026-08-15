import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const IN_MEMORY_PATHS = new Set([':memory:', '']);

/**
 * Opens the SQLite connection with the pragmas required by
 * docs/DATABASE_RULES.md section 1. These are NOT optional.
 */
export function openDatabase(dbPath: string): Database.Database {
  // SQLite creates the file, not the folder — a fresh install has no
  // app-data directory yet, so `new Database()` fails otherwise.
  if (!IN_MEMORY_PATHS.has(dbPath)) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL'); // survives most crashes
  db.pragma('foreign_keys = ON'); // OFF by default in SQLite
  db.pragma('synchronous = FULL'); // power cuts are the top risk — do not "optimise"
  db.pragma('busy_timeout = 5000');

  return db;
}
