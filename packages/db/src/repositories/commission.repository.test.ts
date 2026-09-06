import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { computeCommission } from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyJobDeliveryRepository } from './job-delivery.repository.js';
import { KyselyCommissionRepository, getLabourTotalPaisa } from './commission.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let partyRepo: KyselyPartyRepository;
let deliveryRepo: KyselyJobDeliveryRepository;
let commissionRepo: KyselyCommissionRepository;

let repairUnitId: string;
let partsUnitId: string;
let customerId: string;
let serviceChargeId: string;
let partItemId: string;

function insertJob(assignedTo: string | null): string {
  const jobId = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO job (id, tenant_id, doc_no, customer_id, job_type, received_date, assigned_to, status, labour_charge, parts_cost, total_charge, warranty_days, is_warranty_rework, revenue_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_shop', '2026-09-05', ?, 'received', 0, 0, 0, 0, 0, 'customer_paid', ?, ?)`,
    )
    .run(jobId, TENANT_ID, `JOB-${jobId}`, customerId, assignedTo, now, now);
  rawDb
    .prepare(
      `INSERT INTO job_status_history (id, tenant_id, job_id, from_status, to_status, changed_at)
       VALUES (?, ?, ?, NULL, 'received', ?)`,
    )
    .run(newId(), TENANT_ID, jobId, now);
  return jobId;
}

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-commission-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  kysely = createKyselyDb(rawDb);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
  deliveryRepo = new KyselyJobDeliveryRepository(kysely, TENANT_ID, DEVICE_CODE);
  commissionRepo = new KyselyCommissionRepository(kysely, TENANT_ID, DEVICE_CODE);

  repairUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'REPAIR'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  partsUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string }
  ).id;

  const customer = await partyRepo.createCustomer({
    partyCode: null,
    name: 'Ahmad',
    shopName: null,
    phone: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: null,
    notes: null,
  });
  customerId = customer.id;

  const now = new Date().toISOString();
  serviceChargeId = newId();
  rawDb
    .prepare(
      `INSERT INTO service_charge (id, tenant_id, business_unit_id, name, retail_charge, is_active, created_at)
       VALUES (?, ?, ?, 'AC Service', 120000, 1, ?)`,
    )
    .run(serviceChargeId, TENANT_ID, repairUnitId, now);

  const pieceUom = rawDb
    .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`)
    .get(TENANT_ID) as { id: string };
  partItemId = newId();
  rawDb
    .prepare(
      `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, avg_cost, created_at, updated_at)
       VALUES (?, ?, 'ITM-TEST', 'Test Part', ?, ?, 500, ?, ?)`,
    )
    .run(partItemId, TENANT_ID, partsUnitId, pieceUom.id, now, now);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyCommissionRepository.recordCommission (PHASE_7.md §5 GAP-10, EC-P7-6)', () => {
  it('inserts correct party_ledger row — commissionPaisa = 12000 (pre-computed)', async () => {
    const technician = await partyRepo.createStaff({
      name: 'Naeem',
      phone: '0300',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 1000,
    });
    const jobId = insertJob(technician.id);

    await commissionRepo.recordCommission({
      technicianId: technician.id,
      jobId,
      commissionPaisa: 12000,
      deliveryDate: '2026-09-06',
    });

    const row = rawDb
      .prepare(
        `SELECT amount, entry_type, source_type, source_id FROM party_ledger WHERE party_id = ?`,
      )
      .get(technician.id) as {
      amount: number;
      entry_type: string;
      source_type: string;
      source_id: string;
    };
    expect(row).toEqual({
      amount: -12000,
      entry_type: 'commission',
      source_type: 'job',
      source_id: jobId,
    });
  });

  it('recordCommission with commissionPaisa = 0 throws, inserts nothing', async () => {
    const technician = await partyRepo.createStaff({
      name: 'Naeem',
      phone: '0300',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 1000,
    });
    const jobId = insertJob(technician.id);

    await expect(
      commissionRepo.recordCommission({
        technicianId: technician.id,
        jobId,
        commissionPaisa: 0,
        deliveryDate: '2026-09-06',
      }),
    ).rejects.toThrow();

    const rows = rawDb.prepare(`SELECT id FROM party_ledger WHERE party_id = ?`).all(technician.id);
    expect(rows).toHaveLength(0);
  });
});

describe('getLabourTotalPaisa + computeCommission — end to end through a real delivery (EC-P7-6)', () => {
  it('PARTS-unit lines do not contribute to commission — only the REPAIR labour line counts', async () => {
    const technician = await partyRepo.createStaff({
      name: 'Naeem',
      phone: '0300',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 1000, // 10%
    });
    const jobId = insertJob(technician.id);

    const result = await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-06',
      partLines: [], // no job_part-sourced part line needed for this test
      labourLines: [
        {
          serviceChargeId,
          unitPricePaisa: null, // resolves to service_charge.retail_charge = 120000
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      paidPaisa: 0,
    });

    // Add a PARTS-unit sale_line directly (bypassing job_part, since this
    // test only needs a second line on the same sale to prove PARTS is
    // excluded from the commission SUM, not a full parts-issue flow).
    rawDb
      .prepare(
        `INSERT INTO sale_line
           (id, tenant_id, sale_id, line_no, item_id, quantity, unit_price, unit_cost,
            line_total, business_unit_id, line_kind, payer_party_id, revenue_type)
         VALUES (?, ?, ?, 2, ?, 1000, 800, 500, 800, ?, 'part', ?, 'customer_paid')`,
      )
      .run(newId(), TENANT_ID, result.id, partItemId, partsUnitId, customerId);

    const labourTotalPaisa = await getLabourTotalPaisa(kysely, TENANT_ID, result.id);

    // Hand-calc: labour_total = 120000 (REPAIR labour line only — the
    // 800-paisa PARTS line must NOT be included).
    //   NOT 120000 + 800 = 120800.
    expect(labourTotalPaisa).toBe(120000);

    const commissionPaisa = computeCommission(labourTotalPaisa, 1000);
    // FLOOR(120000 x 1000 / 10000) = FLOOR(12000) = 12000
    expect(commissionPaisa).toBe(12000);

    await commissionRepo.recordCommission({
      technicianId: technician.id,
      jobId,
      commissionPaisa,
      deliveryDate: '2026-09-06',
    });

    const row = rawDb
      .prepare(`SELECT amount FROM party_ledger WHERE party_id = ?`)
      .get(technician.id) as { amount: number };
    expect(row.amount).toBe(-12000);
  });

  it('EC-P7-6: Rs 1,200 labour, 10% commission -> exactly 12000 paisa, technician with commission_bp=0 gets nothing', async () => {
    const technicianWithCommission = await partyRepo.createStaff({
      name: 'Naeem',
      phone: '0300',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 1000,
    });
    const technicianNoCommission = await partyRepo.createStaff({
      name: 'Bilal',
      phone: '0301',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 0,
    });

    const job1 = insertJob(technicianWithCommission.id);
    const delivery1 = await deliveryRepo.deliverJob({
      jobId: job1,
      saleDate: '2026-09-06',
      partLines: [],
      labourLines: [
        {
          serviceChargeId,
          unitPricePaisa: null,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      paidPaisa: 0,
    });
    const labour1 = await getLabourTotalPaisa(kysely, TENANT_ID, delivery1.id);
    // labour_total_paisa = 120000 (service_charge.retail_charge, matches
    // the Rs 1,200 EC-P7-6 scenario)
    expect(labour1).toBe(120000);
    // FLOOR(120000 x 1000 / 10000) = 12000
    const commission1 = computeCommission(labour1, 1000);
    expect(commission1).toBe(12000);
    await commissionRepo.recordCommission({
      technicianId: technicianWithCommission.id,
      jobId: job1,
      commissionPaisa: commission1,
      deliveryDate: '2026-09-06',
    });

    const row1 = rawDb
      .prepare(
        `SELECT amount, entry_type, source_type, source_id FROM party_ledger WHERE party_id = ?`,
      )
      .get(technicianWithCommission.id) as {
      amount: number;
      entry_type: string;
      source_type: string;
      source_id: string;
    };
    expect(row1).toEqual({
      amount: -12000,
      entry_type: 'commission',
      source_type: 'job',
      source_id: job1,
    });

    // Second technician: commission_bp = 0 -> computeCommission returns 0
    // -> the handler's guard means recordCommission is never called.
    const job2 = insertJob(technicianNoCommission.id);
    await deliveryRepo.deliverJob({
      jobId: job2,
      saleDate: '2026-09-06',
      partLines: [],
      labourLines: [
        {
          serviceChargeId,
          unitPricePaisa: null,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      paidPaisa: 0,
    });
    const commission2 = computeCommission(120000, 0);
    expect(commission2).toBe(0);
    // No recordCommission call for a 0 result — confirm zero rows exist.
    const rows2 = rawDb
      .prepare(`SELECT id FROM party_ledger WHERE party_id = ?`)
      .all(technicianNoCommission.id);
    expect(rows2).toHaveLength(0);
  });

  it('a commission recording failure does not roll back the delivery', async () => {
    const technician = await partyRepo.createStaff({
      name: 'Naeem',
      phone: '0300',
      staffRole: 'technician',
      wageRatePaisa: 60000,
      commissionBp: 1000,
    });
    const jobId = insertJob(technician.id);

    const result = await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-06',
      partLines: [],
      labourLines: [
        {
          serviceChargeId,
          unitPricePaisa: null,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      paidPaisa: 0,
    });

    // Simulates the handler's try/catch isolation: recordCommission with
    // a non-existent technicianId violates party_ledger's FK on party_id.
    await expect(
      commissionRepo.recordCommission({
        technicianId: 'does-not-exist',
        jobId,
        commissionPaisa: 12000,
        deliveryDate: '2026-09-06',
      }),
    ).rejects.toThrow();

    // The delivery sale must still exist — a commission failure never
    // touches the already-committed delivery transaction.
    const sale = rawDb.prepare(`SELECT id FROM sale WHERE id = ?`).get(result.id);
    expect(sale).toBeDefined();

    const commissionRows = rawDb
      .prepare(`SELECT id FROM party_ledger WHERE source_id = ? AND entry_type = 'commission'`)
      .all(jobId);
    expect(commissionRows).toHaveLength(0);
  });
});
