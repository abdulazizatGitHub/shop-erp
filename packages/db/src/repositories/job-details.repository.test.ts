import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyJobRepository } from './job.repository.js';
import { KyselyJobDetailsRepository } from './job-details.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let jobRepo: KyselyJobRepository;
let detailsRepo: KyselyJobDetailsRepository;

const BASE_JOB_FIELDS = {
  customerId: null,
  customerNameAdhoc: null,
  customerPhone: null,
  jobClientId: null,
  newClient: null,
  jobType: 'in_shop',
  applianceType: 'AC',
  applianceBrand: 'Gree',
  applianceModel: null,
  applianceSerial: null,
  reportedFault: 'Not cooling',
  receivedDate: '2026-09-22',
  promisedDate: null,
  estimateAmountPaisa: null,
  assignedTo: null,
  notes: null,
} as const;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-job-details-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  jobRepo = new KyselyJobRepository(kysely, TENANT_ID, DEVICE_CODE);
  detailsRepo = new KyselyJobDetailsRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

/** Forces a job straight to 'delivered' by inserting the history row
 * directly — cheaper than running the full deliver transaction (sale +
 * service charges + technician custody) just to get a terminal status. */
function forceStatus(jobId: string, toStatus: string): void {
  rawDb
    .prepare(
      `INSERT INTO job_status_history (id, tenant_id, job_id, from_status, to_status, changed_at, changed_by, note)
       VALUES (?, ?, ?, 'received', ?, ?, NULL, NULL)`,
    )
    .run(newId(), TENANT_ID, jobId, toStatus, new Date().toISOString());
}

describe('KyselyJobDetailsRepository.updateJobDetails', () => {
  it('updates reportedFault on a received job', async () => {
    const created = await jobRepo.createJob(BASE_JOB_FIELDS);
    expect(created.status).toBe('received');

    const updated = await detailsRepo.updateJobDetails({
      jobId: created.id,
      reportedFault: 'Not cooling at all, compressor silent',
    });

    expect(updated.reportedFault).toBe('Not cooling at all, compressor silent');

    const row = rawDb.prepare(`SELECT reported_fault FROM job WHERE id = ?`).get(created.id) as {
      reported_fault: string;
    };
    expect(row.reported_fault).toBe('Not cooling at all, compressor silent');
  });

  it('throws when attempting to update a delivered job, and writes nothing', async () => {
    const created = await jobRepo.createJob(BASE_JOB_FIELDS);
    forceStatus(created.id, 'delivered');

    await expect(
      detailsRepo.updateJobDetails({
        jobId: created.id,
        reportedFault: 'Should never be written',
      }),
    ).rejects.toThrow('Cannot edit a delivered or cancelled job.');

    const row = rawDb.prepare(`SELECT reported_fault FROM job WHERE id = ?`).get(created.id) as {
      reported_fault: string;
    };
    expect(row.reported_fault).toBe('Not cooling');
  });

  it('throws when attempting to update a cancelled job', async () => {
    const created = await jobRepo.createJob(BASE_JOB_FIELDS);
    forceStatus(created.id, 'cancelled');

    await expect(
      detailsRepo.updateJobDetails({ jobId: created.id, notes: 'Late edit attempt' }),
    ).rejects.toThrow('Cannot edit a delivered or cancelled job.');
  });

  it('updates two fields at once and touches no other column', async () => {
    const created = await jobRepo.createJob(BASE_JOB_FIELDS);

    await detailsRepo.updateJobDetails({
      jobId: created.id,
      applianceBrand: 'Haier',
      notes: 'Customer prefers evening visits',
    });

    const row = rawDb.prepare(`SELECT * FROM job WHERE id = ?`).get(created.id) as Record<
      string,
      unknown
    >;
    expect(row['appliance_brand']).toBe('Haier');
    expect(row['notes']).toBe('Customer prefers evening visits');
    // Every other field from BASE_JOB_FIELDS unchanged.
    expect(row['appliance_type']).toBe('AC');
    expect(row['reported_fault']).toBe('Not cooling');
    expect(row['promised_date']).toBeNull();
    expect(row['job_client_id']).toBeNull();
  });

  it('does not write anything (job_client_id stays null) when the field is omitted, not explicitly nulled', async () => {
    const created = await jobRepo.createJob(BASE_JOB_FIELDS);

    const updated = await detailsRepo.updateJobDetails({
      jobId: created.id,
      applianceModel: 'HRF-360',
    });

    // jobClientId was never passed — undefined-means-skip, still null.
    expect(updated.jobClientId).toBeNull();
    expect(updated.applianceModel).toBe('HRF-360');
  });
});
