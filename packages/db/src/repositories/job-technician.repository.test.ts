import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyJobRepository } from './job.repository.js';
import { KyselyJobTechnicianRepository } from './job-technician.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let jobRepo: KyselyJobRepository;
let jobTechnicianRepo: KyselyJobTechnicianRepository;
let partyRepo: KyselyPartyRepository;

let customerId: string;
let technicianAId: string;
let technicianBId: string;

function insertJobStatusHistory(jobId: string, fromStatus: string | null, toStatus: string): void {
  rawDb
    .prepare(
      `INSERT INTO job_status_history (id, tenant_id, job_id, from_status, to_status, changed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), TENANT_ID, jobId, fromStatus, toStatus, new Date().toISOString());
}

function insertJob(): string {
  const id = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO job (id, tenant_id, doc_no, customer_id, job_type, received_date, status, labour_charge, parts_cost, total_charge, warranty_days, is_warranty_rework, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_shop', '2026-09-24', 'received', 0, 0, 0, 0, 0, ?, ?)`,
    )
    .run(id, TENANT_ID, `JOB-${id.slice(0, 4)}`, customerId, now, now);
  insertJobStatusHistory(id, null, 'received');
  return id;
}

/** Moves a job through received -> in_progress -> [toStatus], recording real job_status_history rows so deriveStatus reflects it. */
function moveJobToStatus(jobId: string, toStatus: string): void {
  if (toStatus === 'received') return;
  insertJobStatusHistory(jobId, 'received', 'in_progress');
  if (toStatus === 'in_progress') return;
  insertJobStatusHistory(jobId, 'in_progress', toStatus);
}

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-job-technician-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  kysely = createKyselyDb(rawDb);
  jobRepo = new KyselyJobRepository(kysely, TENANT_ID, DEVICE_CODE);
  jobTechnicianRepo = new KyselyJobTechnicianRepository(kysely, TENANT_ID);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);

  const customer = await partyRepo.createCustomer({
    partyCode: null,
    name: 'Ahmad',
    shopName: null,
    phone: null,
    address: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: null,
    notes: null,
  });
  customerId = customer.id;

  const technicianA = await partyRepo.createStaff({
    name: 'Naeem',
    phone: '0300',
    staffRole: 'technician',
    wageRatePaisa: 60000,
    commissionBp: 0,
  });
  technicianAId = technicianA.id;
  const technicianB = await partyRepo.createStaff({
    name: 'Bilal',
    phone: '0301',
    staffRole: 'technician',
    wageRatePaisa: 60000,
    commissionBp: 0,
  });
  technicianBId = technicianB.id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyJobRepository.assignTechnician — technician list lock (P16-3c, OD-16-5)', () => {
  it.each(['ready', 'delivered', 'cancelled'])(
    'assigning a technician on a job at status "%s" is rejected, no row written',
    async (status) => {
      const jobId = insertJob();
      moveJobToStatus(jobId, status);

      await expect(
        jobRepo.assignTechnician({ jobId, technicianPartyId: technicianAId }),
      ).rejects.toThrow(/locked/);

      const rows = rawDb.prepare(`SELECT id FROM job_technician WHERE job_id = ?`).all(jobId);
      expect(rows).toHaveLength(0);
    },
  );

  it('assigning a technician on an in_progress job succeeds', async () => {
    const jobId = insertJob();
    moveJobToStatus(jobId, 'in_progress');

    await expect(
      jobRepo.assignTechnician({ jobId, technicianPartyId: technicianAId }),
    ).resolves.toBeTruthy();

    const rows = rawDb.prepare(`SELECT id FROM job_technician WHERE job_id = ?`).all(jobId);
    expect(rows).toHaveLength(1);
  });
});

describe('KyselyJobTechnicianRepository.unassignTechnician — technician list lock + required reason (P16-3c, OD-16-5)', () => {
  async function assignAndGetAssignmentId(jobId: string): Promise<string> {
    await jobRepo.assignTechnician({ jobId, technicianPartyId: technicianAId });
    const row = rawDb
      .prepare(`SELECT id FROM job_technician WHERE job_id = ? AND party_id = ?`)
      .get(jobId, technicianAId) as { id: string };
    return row.id;
  }

  it.each(['ready', 'delivered', 'cancelled'])(
    'unassigning on a job at status "%s" is rejected, row untouched',
    async (status) => {
      const jobId = insertJob();
      const assignmentId = await assignAndGetAssignmentId(jobId);
      moveJobToStatus(jobId, status);

      await expect(
        jobTechnicianRepo.unassignTechnician(assignmentId, 'Technician left the company'),
      ).rejects.toThrow(/locked/);

      const row = rawDb
        .prepare(`SELECT unassigned_at, unassign_reason FROM job_technician WHERE id = ?`)
        .get(assignmentId) as { unassigned_at: string | null; unassign_reason: string | null };
      expect(row.unassigned_at).toBeNull();
      expect(row.unassign_reason).toBeNull();
    },
  );

  it('unassigning with an empty reason is rejected (core-layer check, bypassing Zod)', async () => {
    const jobId = insertJob();
    const assignmentId = await assignAndGetAssignmentId(jobId);

    await expect(jobTechnicianRepo.unassignTechnician(assignmentId, '')).rejects.toThrow(
      /reason is required/,
    );
  });

  it('unassigning with a whitespace-only reason is rejected', async () => {
    const jobId = insertJob();
    const assignmentId = await assignAndGetAssignmentId(jobId);

    await expect(jobTechnicianRepo.unassignTechnician(assignmentId, '   ')).rejects.toThrow(
      /reason is required/,
    );
  });

  it('unassigning on an in_progress job with a non-blank reason succeeds — unassigned_at and the reason are stored exactly as given, the row is not deleted', async () => {
    const jobId = insertJob();
    const assignmentId = await assignAndGetAssignmentId(jobId);
    moveJobToStatus(jobId, 'in_progress');

    await jobTechnicianRepo.unassignTechnician(assignmentId, '  Technician left the company  ');

    const row = rawDb
      .prepare(`SELECT unassigned_at, unassign_reason FROM job_technician WHERE id = ?`)
      .get(assignmentId) as { unassigned_at: string | null; unassign_reason: string | null };
    expect(row.unassigned_at).not.toBeNull();
    expect(row.unassign_reason).toBe('Technician left the company');

    const assignments = await jobTechnicianRepo.listTechnicianAssignments(jobId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      id: assignmentId,
      unassignReason: 'Technician left the company',
    });
  });

  it('unassigning an unknown assignment id throws, not a silent no-op', async () => {
    await expect(
      jobTechnicianRepo.unassignTechnician('does-not-exist', 'Some reason'),
    ).rejects.toThrow(/not found/);
  });

  it('a job that moves BACKWARDS from ready to an earlier status lifts the lock — reassigning then succeeds again', async () => {
    const jobId = insertJob();
    const assignmentId = await assignAndGetAssignmentId(jobId);
    moveJobToStatus(jobId, 'ready');

    await expect(
      jobTechnicianRepo.unassignTechnician(assignmentId, 'Wrong technician'),
    ).rejects.toThrow(/locked/);

    // Job moves back to in_progress (e.g. more work found after being marked ready).
    insertJobStatusHistory(jobId, 'ready', 'in_progress');

    await expect(
      jobTechnicianRepo.unassignTechnician(assignmentId, 'Wrong technician'),
    ).resolves.toBeUndefined();
    await expect(
      jobRepo.assignTechnician({ jobId, technicianPartyId: technicianBId }),
    ).resolves.toBeTruthy();
  });
});
