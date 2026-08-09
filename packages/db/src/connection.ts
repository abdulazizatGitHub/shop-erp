import Database from 'better-sqlite3';

/**
 * Opens the SQLite connection with the pragmas required by
 * docs/DATABASE_RULES.md section 1. These are NOT optional.
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);

  db.pragma('journal_mode = WAL'); // survives most crashes
  db.pragma('foreign_keys = ON'); // OFF by default in SQLite
  db.pragma('synchronous = FULL'); // power cuts are the top risk — do not "optimise"
  db.pragma('busy_timeout = 5000');

  return db;
}
