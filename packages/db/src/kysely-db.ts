import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely';
import type Database from 'better-sqlite3';
import type { Database as Schema } from './kysely-schema.js';

/**
 * Wraps an already-opened connection (pragmas already set by
 * openDatabase()) in a typed Kysely instance. better-sqlite3 is fully
 * synchronous under the hood; Kysely's Promise-based API adds microtask
 * overhead but no real async I/O — this is the standard way to pair them.
 */
export function createKyselyDb(rawDb: Database.Database): Kysely<Schema> {
  return new Kysely<Schema>({
    dialect: new SqliteDialect({ database: rawDb }),
    plugins: [new CamelCasePlugin()],
  });
}

export type { Schema as KyselyDatabase };
