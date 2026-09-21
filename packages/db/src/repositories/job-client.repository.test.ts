import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyJobClientRepository } from './job-client.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyJobClientRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-job-client-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyJobClientRepository(kysely, TENANT_ID);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyJobClientRepository.searchJobClients', () => {
  it('search by name returns matching rows', async () => {
    await repo.createJobClient({
      name: 'Khalid Rehman',
      phone: '03001234567',
      phone2: null,
      address: null,
      area: null,
      landmark: null,
      notes: null,
    });
    await repo.createJobClient({
      name: 'Zubair Khan',
      phone: '03007654321',
      phone2: null,
      address: null,
      area: null,
      landmark: null,
      notes: null,
    });

    const results = await repo.searchJobClients({ query: 'Khalid' });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Khalid Rehman');
  });

  it('search by phone returns matching rows', async () => {
    await repo.createJobClient({
      name: 'Khalid Rehman',
      phone: '03001234567',
      phone2: null,
      address: null,
      area: null,
      landmark: null,
      notes: null,
    });
    await repo.createJobClient({
      name: 'Zubair Khan',
      phone: '03007654321',
      phone2: null,
      address: null,
      area: null,
      landmark: null,
      notes: null,
    });

    const results = await repo.searchJobClients({ query: '03007654321' });

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Zubair Khan');
  });
});

describe('KyselyJobClientRepository.createJobClient / getJobClientById', () => {
  it('create then getById round-trips all fields, including nullable ones', async () => {
    const created = await repo.createJobClient({
      name: 'Fazal Rabbi',
      phone: '03119876543',
      phone2: '03219876543',
      address: 'House 12, GT Road',
      area: 'Batkhela',
      landmark: 'next to blue mosque',
      notes: 'Prefers evening visits',
    });

    const fetched = await repo.getJobClientById(created.id);

    expect(fetched).toEqual({
      id: created.id,
      name: 'Fazal Rabbi',
      phone: '03119876543',
      phone2: '03219876543',
      address: 'House 12, GT Road',
      area: 'Batkhela',
      landmark: 'next to blue mosque',
      notes: 'Prefers evening visits',
    });

    const raw = rawDb.prepare(`SELECT * FROM job_client WHERE id = ?`).get(created.id) as Record<
      string,
      unknown
    >;
    expect(raw['name']).toBe('Fazal Rabbi');
    expect(raw['phone_2']).toBe('03219876543');
    expect(raw['landmark']).toBe('next to blue mosque');
    expect(raw['tenant_id']).toBe(TENANT_ID);
  });

  it('round-trips a job client with every nullable field left null', async () => {
    const created = await repo.createJobClient({
      name: 'Walk-in Client',
      phone: null,
      phone2: null,
      address: null,
      area: null,
      landmark: null,
      notes: null,
    });

    const fetched = await repo.getJobClientById(created.id);

    expect(fetched).toEqual({
      id: created.id,
      name: 'Walk-in Client',
      phone: null,
      phone2: null,
      address: null,
      area: null,
      landmark: null,
      notes: null,
    });
  });

  it('getJobClientById returns null for a non-existent id', async () => {
    const fetched = await repo.getJobClientById('00000000-0000-0000-0000-00000000dead');
    expect(fetched).toBeNull();
  });
});
