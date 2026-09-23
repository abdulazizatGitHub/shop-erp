import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import { listActiveBrands } from './lookup.repository.js';
import { KyselyBrandRepository } from './brand.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let repo: KyselyBrandRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-brand-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  repo = new KyselyBrandRepository(kysely, TENANT_ID);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyBrandRepository — P16-2', () => {
  it('creates a brand and reads it back, active by default', async () => {
    const record = await repo.createBrand({ name: 'Midea' });
    expect(record.name).toBe('Midea');
    expect(record.isActive).toBe(true);

    const admin = await repo.listBrandsAdmin();
    expect(admin.some((b) => b.id === record.id && b.name === 'Midea')).toBe(true);
  });

  it('rejects a case-insensitive duplicate against a seeded starter brand', async () => {
    await expect(repo.createBrand({ name: 'haier' })).rejects.toThrow(/already exists/);
  });

  it('rejects a case-insensitive duplicate against a soft-deleted row', async () => {
    const created = await repo.createBrand({ name: 'Midea' });
    await kysely
      .updateTable('brand')
      .set({ deletedAt: new Date().toISOString() })
      .where('id', '=', created.id)
      .execute();

    await expect(repo.createBrand({ name: 'midea' })).rejects.toThrow(/already exists/);
  });

  it('toggle active/inactive: is excluded from listActiveBrands (job-intake dropdown) when inactive, but stays in the admin list', async () => {
    const created = await repo.createBrand({ name: 'Midea' });

    let dropdown = await listActiveBrands(kysely, TENANT_ID);
    expect(dropdown.some((b) => b.id === created.id)).toBe(true);

    const toggled = await repo.toggleBrandActive(created.id, false);
    expect(toggled.isActive).toBe(false);

    dropdown = await listActiveBrands(kysely, TENANT_ID);
    expect(dropdown.some((b) => b.id === created.id)).toBe(false);

    const admin = await repo.listBrandsAdmin();
    expect(admin.some((b) => b.id === created.id)).toBe(true);
  });

  it('deactivating a brand does not soft-delete it — listBrandsAdmin still returns it (deleted_at untouched, §2c)', async () => {
    const created = await repo.createBrand({ name: 'Midea' });
    await repo.toggleBrandActive(created.id, false);

    const row = await kysely
      .selectFrom('brand')
      .select('deletedAt')
      .where('id', '=', created.id)
      .executeTakeFirstOrThrow();
    expect(row.deletedAt).toBeNull();
  });
});
