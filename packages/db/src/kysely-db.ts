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
    // underscoreBeforeDigits: Phase 15's job_client.phone_2 (0016_job_client.sql)
    // is the first snake_case column in this schema with a digit suffix.
    // CamelCasePlugin's default snake-caser has no rule for digits (only
    // uppercase letters trigger an inserted underscore), so `phone2` on the
    // JS side would otherwise compile to the literal (wrong) column name
    // `phone2`, not `phone_2` — confirmed by running the round-trip test
    // against a real SQLite file before adding this option (SqliteError:
    // "table job_client has no column named phone2"). Grepped the rest of
    // kysely-schema.ts for any other camelCase field containing a digit
    // before enabling this globally — none exist, so this is a no-op for
    // every other table.
    plugins: [new CamelCasePlugin({ underscoreBeforeDigits: true })],
  });
}

export type { Schema as KyselyDatabase };
