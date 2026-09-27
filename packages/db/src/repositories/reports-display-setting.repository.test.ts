import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { getRowsPerPage, setRowsPerPage } from './reports-display-setting.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: ReturnType<typeof createKyselyDb>;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-reports-display-setting-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('rows-per-page setting (P17-3, docs/phases/PHASE_17.md §2.5/§8, Q17-2)', () => {
  it('defaults to 10 when no setting row has ever been written (fresh DB)', async () => {
    const value = await getRowsPerPage(kysely, TENANT_ID);
    expect(value).toBe(10);

    const row = rawDb
      .prepare(`SELECT COUNT(*) AS n FROM setting WHERE tenant_id = ? AND key = 'rowsPerPage'`)
      .get(TENANT_ID) as { n: number };
    expect(row.n).toBe(0); // reading the default never writes a row
  });

  it('returns 25 after being explicitly set', async () => {
    await setRowsPerPage(kysely, TENANT_ID, 25);

    const value = await getRowsPerPage(kysely, TENANT_ID);
    expect(value).toBe(25);

    const row = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'rowsPerPage'`)
      .get(TENANT_ID) as { value: string };
    expect(row.value).toBe('25');
  });

  it('returns 50 after being explicitly set', async () => {
    await setRowsPerPage(kysely, TENANT_ID, 50);

    const value = await getRowsPerPage(kysely, TENANT_ID);
    expect(value).toBe(50);
  });

  it('setting it twice updates the same row rather than inserting a duplicate', async () => {
    await setRowsPerPage(kysely, TENANT_ID, 25);
    await setRowsPerPage(kysely, TENANT_ID, 10);

    const rows = rawDb
      .prepare(`SELECT value FROM setting WHERE tenant_id = ? AND key = 'rowsPerPage'`)
      .all(TENANT_ID) as Array<{ value: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('10');

    const value = await getRowsPerPage(kysely, TENANT_ID);
    expect(value).toBe(10);
  });

  it('a malformed or out-of-range stored value falls back to the default (10), not NaN or the raw string', async () => {
    rawDb
      .prepare(
        `INSERT INTO setting (tenant_id, key, value, updated_at) VALUES (?, 'rowsPerPage', 'not-a-number', ?)`,
      )
      .run(TENANT_ID, new Date().toISOString());

    const value = await getRowsPerPage(kysely, TENANT_ID);
    expect(value).toBe(10);
  });
});
