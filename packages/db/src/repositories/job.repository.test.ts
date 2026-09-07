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
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyJobRepository } from './job.repository.js';

function insertJobStatusHistory(jobId: string, fromStatus: string | null, toStatus: string): void {
  rawDb
    .prepare(
      `INSERT INTO job_status_history (id, tenant_id, job_id, from_status, to_status, changed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), TENANT_ID, jobId, fromStatus, toStatus, new Date().toISOString());
}

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let jobRepo: KyselyJobRepository;
let partyRepo: KyselyPartyRepository;

let partsUnitId: string;
let shopWarehouseId: string;
let technicianWarehouseId: string;
let technicianPartyId: string;
let compressorItemId: string;
let gasItemId: string;
let customerId: string;

function insertJob(overrides: Partial<Record<string, unknown>> = {}): string {
  const id = newId();
  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    id,
    tenant_id: TENANT_ID,
    doc_no: overrides['doc_no'] ?? `JOB-${id.slice(0, 4)}`,
    customer_id: customerId,
    job_type: 'in_shop',
    received_date: '2026-09-05',
    assigned_to: technicianPartyId,
    status: 'received',
    labour_charge: 0,
    parts_cost: 0,
    total_charge: 0,
    warranty_days: 0,
    is_warranty_rework: 0,
    revenue_type: 'customer_paid',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const columns = Object.keys(fields);
  const placeholders = columns.map(() => '?').join(', ');
  rawDb
    .prepare(`INSERT INTO job (${columns.join(', ')}) VALUES (${placeholders})`)
    .run(...columns.map((c) => fields[c]));
  return id;
}

function insertStockMovement(
  warehouseId: string,
  itemId: string,
  quantityMilli: number,
  movementType: string,
): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, source_type, source_id, reason, reversed_by_id, created_at, created_by, business_unit_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, ?)`,
    )
    .run(
      newId(),
      TENANT_ID,
      itemId,
      warehouseId,
      now,
      movementType,
      quantityMilli,
      now,
      partsUnitId,
    );
}

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-job-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  jobRepo = new KyselyJobRepository(kysely, TENANT_ID, DEVICE_CODE);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);

  const partsUnit = rawDb
    .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
    .get(TENANT_ID) as { id: string };
  partsUnitId = partsUnit.id;

  const pieceUom = rawDb
    .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`)
    .get(TENANT_ID) as { id: string };
  const kgUom = rawDb
    .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`)
    .get(TENANT_ID) as { id: string };

  const shopWarehouse = rawDb
    .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
    .get(TENANT_ID) as { id: string };
  shopWarehouseId = shopWarehouse.id;

  technicianPartyId = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, staff_role, is_active, created_at, updated_at)
       VALUES (?, ?, 'STF-0001', 'staff', 'Naeem', 'technician', 1, ?, ?)`,
    )
    .run(technicianPartyId, TENANT_ID, now, now);

  technicianWarehouseId = newId();
  rawDb
    .prepare(
      `INSERT INTO warehouse (id, tenant_id, name, is_default, warehouse_kind, custodian_party_id)
       VALUES (?, ?, 'Naeem - Technician', 0, 'technician', ?)`,
    )
    .run(technicianWarehouseId, TENANT_ID, technicianPartyId);

  rawDb
    .prepare(
      `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, created_at, updated_at)
       VALUES (?, ?, 'ITM-0001', 'Compressor 1.5T', ?, ?, ?, ?)`,
    )
    .run(newId(), TENANT_ID, partsUnitId, pieceUom.id, now, now);
  compressorItemId = (
    rawDb.prepare(`SELECT id FROM item WHERE item_code = 'ITM-0001'`).get() as { id: string }
  ).id;

  rawDb
    .prepare(
      `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, created_at, updated_at)
       VALUES (?, ?, 'ITM-0002', 'Refrigerant Gas', ?, ?, ?, ?)`,
    )
    .run(newId(), TENANT_ID, partsUnitId, kgUom.id, now, now);
  gasItemId = (
    rawDb.prepare(`SELECT id FROM item WHERE item_code = 'ITM-0002'`).get() as { id: string }
  ).id;

  const customer = await partyRepo.createCustomer({
    partyCode: null,
    name: 'Ahmad Fridge Repairs',
    shopName: null,
    phone: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: null,
    notes: null,
  });
  customerId = customer.id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyJobRepository.getJob', () => {
  it('returns the job mapped to a JobRecord, falling back to job.status when no history exists', async () => {
    // No job_status_history row inserted for this fixture — proves the
    // fallback path (raw-inserted/legacy rows with no history yet).
    const jobId = insertJob({ doc_no: 'JOB-0001', reported_fault: 'Not cooling' });

    const job = await jobRepo.getJob(jobId);

    expect(job).not.toBeNull();
    expect(job?.docNo).toBe('JOB-0001');
    expect(job?.customerId).toBe(customerId);
    expect(job?.assignedTo).toBe(technicianPartyId);
    expect(job?.status).toBe('received');
    expect(job?.reportedFault).toBe('Not cooling');
    expect(job?.revenueType).toBe('customer_paid');
    expect(job?.saleId).toBeNull();
  });

  it('derives status from the LATEST job_status_history row, not the (stale) job.status column', async () => {
    // job.status column deliberately left at its stale INSERT-time value
    // ('received') while history says the real current status is
    // 'in_progress' — proves getJob prefers history over the column,
    // per the STATUS MACHINE rule (job.status is never updated after
    // createJob's initial insert).
    const jobId = insertJob({ doc_no: 'JOB-0002', status: 'received' });
    insertJobStatusHistory(jobId, null, 'received');
    insertJobStatusHistory(jobId, 'received', 'in_progress');

    const job = await jobRepo.getJob(jobId);

    expect(job?.status).toBe('in_progress');
  });

  it('returns null for an unknown id', async () => {
    const job = await jobRepo.getJob(newId());
    expect(job).toBeNull();
  });

  it('P8-3 (BUG-P6.5-1): invoiceDocNo is populated once job.sale_id points at a real sale', async () => {
    const jobId = insertJob({ doc_no: 'JOB-0004' });
    const warehouse = rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as { id: string };
    const priceLevel = rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'`)
      .get(TENANT_ID) as { id: string };
    const saleId = newId();
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO sale (id, tenant_id, doc_no, customer_id, warehouse_id, price_level_id, sale_date, sale_type, status, job_id, created_at, updated_at)
         VALUES (?, ?, 'INV-A-000042', ?, ?, ?, '2026-09-05', 'job', 'confirmed', ?, ?, ?)`,
      )
      .run(saleId, TENANT_ID, customerId, warehouse.id, priceLevel.id, jobId, now, now);
    rawDb.prepare(`UPDATE job SET sale_id = ? WHERE id = ?`).run(saleId, jobId);

    const job = await jobRepo.getJob(jobId);

    expect(job?.saleId).toBe(saleId);
    expect(job?.invoiceDocNo).toBe('INV-A-000042');
  });

  it('invoiceDocNo is null for a job that has not been delivered (sale_id is null)', async () => {
    const jobId = insertJob({ doc_no: 'JOB-0005' });

    const job = await jobRepo.getJob(jobId);

    expect(job?.saleId).toBeNull();
    expect(job?.invoiceDocNo).toBeNull();
  });
});

describe('KyselyJobRepository.listJobs', () => {
  it('filters by status and orders most-recent-received first', async () => {
    insertJob({ doc_no: 'JOB-0001', status: 'received', received_date: '2026-09-01' });
    const inProgressLater = insertJob({
      doc_no: 'JOB-0002',
      status: 'in_progress',
      received_date: '2026-09-03',
    });
    const inProgressEarlier = insertJob({
      doc_no: 'JOB-0003',
      status: 'in_progress',
      received_date: '2026-09-02',
    });

    const rows = await jobRepo.listJobs({
      status: 'in_progress',
      assignedTo: null,
      customerId: null,
    });

    expect(rows.map((r) => r.id)).toEqual([inProgressLater, inProgressEarlier]);
  });

  it('filters by assignedTo', async () => {
    insertJob({ doc_no: 'JOB-0001' });
    const otherTechId = newId();
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_code, party_type, name, staff_role, is_active, created_at, updated_at)
         VALUES (?, ?, 'STF-0002', 'staff', 'Bilal', 'technician', 1, ?, ?)`,
      )
      .run(otherTechId, TENANT_ID, now, now);
    insertJob({ doc_no: 'JOB-0002', assigned_to: otherTechId });

    const rows = await jobRepo.listJobs({
      status: null,
      assignedTo: otherTechId,
      customerId: null,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.docNo).toBe('JOB-0002');
  });

  it('includes applianceType/applianceBrand/reportedFault — added for JobsPage (P6-8)', async () => {
    insertJob({
      doc_no: 'JOB-0001',
      appliance_type: 'Fridge',
      appliance_brand: 'Dawlance',
      reported_fault: 'Not cooling',
    });

    const rows = await jobRepo.listJobs({ status: null, assignedTo: null, customerId: null });

    expect(rows[0]?.applianceType).toBe('Fridge');
    expect(rows[0]?.applianceBrand).toBe('Dawlance');
    expect(rows[0]?.reportedFault).toBe('Not cooling');
  });
});

describe('KyselyJobRepository.getJobSplit', () => {
  // v_job_split was rewritten in 0012_job_split_v2.sql to read the real
  // delivered invoice (sale/sale_line) instead of job.labour_charge and
  // a job_part-based estimate. These two tests replace the pre-0012
  // versions, which asserted against the old job_part-only semantics —
  // superseded now that P6-5 (job delivery) defines what a job's
  // sale_line rows actually look like. Return-netting (entry_type)
  // happens on job_part BEFORE delivery — a returned part is simply
  // never included as a sale_line in the first place, so there is no
  // "return" case to test at the sale_line/view level any more; that
  // concern now belongs to job-part.repository.test.ts and
  // job-delivery.repository.test.ts, not here.
  function insertDeliveredSale(
    jobId: string,
    lines: ReadonlyArray<{
      lineKind: 'part' | 'labour';
      itemId: string | null;
      quantity: number;
      unitPrice: number;
      unitCost: number;
    }>,
  ): void {
    const warehouse = rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as { id: string };
    const priceLevel = rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'`)
      .get(TENANT_ID) as { id: string };
    const saleId = newId();
    const now = new Date().toISOString();
    const totalAmount = lines.reduce((sum, l) => sum + (l.unitPrice * l.quantity) / 1000, 0);
    rawDb
      .prepare(
        `INSERT INTO sale (id, tenant_id, doc_no, customer_id, warehouse_id, price_level_id, sale_date, sale_type, subtotal, discount_amount, tax_amount, total_amount, paid_amount, payment_mode, status, job_id, created_at, updated_at)
         VALUES (?, ?, 'INV-9001', ?, ?, ?, '2026-09-05', 'job', ?, 0, 0, ?, ?, 'credit', 'confirmed', ?, ?, ?)`,
      )
      .run(
        saleId,
        TENANT_ID,
        customerId,
        warehouse.id,
        priceLevel.id,
        totalAmount,
        totalAmount,
        totalAmount,
        jobId,
        now,
        now,
      );
    lines.forEach((line, index) => {
      const lineTotal = (line.unitPrice * line.quantity) / 1000;
      rawDb
        .prepare(
          `INSERT INTO sale_line (id, tenant_id, sale_id, line_no, item_id, description, quantity, unit_price, unit_cost, discount_amount, tax_rate, tax_amount, line_total, warranty_months, business_unit_id, line_kind)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, ?)`,
        )
        .run(
          newId(),
          TENANT_ID,
          saleId,
          index + 1,
          line.itemId,
          line.lineKind,
          line.quantity,
          line.unitPrice,
          line.unitCost,
          lineTotal,
          partsUnitId,
          line.lineKind,
        );
    });
  }

  it('sums a delivered part line + labour line correctly (EC-1 hand-calc)', async () => {
    const jobId = insertJob({ doc_no: 'JOB-0001' });
    // Part: 3.05 kg copper pipe, cost Rs 6.50/kg = 650 paisa, price Rs 8.00/kg = 800 paisa
    //   line_total = 800 x 3050 / 1000 = 2440 paisa
    //   cost       = 650 x 3050 / 1000 = 1,982,500 / 1000 = 1982 paisa (SQLite integer truncation)
    // Labour: Rs 1500 = 150000 paisa, unit_cost = 0
    //   parts_margin = 2440 - 1982 = 458
    //   total_bill   = 2440 + 150000 = 152440
    insertDeliveredSale(jobId, [
      { lineKind: 'part', itemId: gasItemId, quantity: 3050, unitPrice: 800, unitCost: 650 },
      { lineKind: 'labour', itemId: null, quantity: 1000, unitPrice: 150000, unitCost: 0 },
    ]);

    const split = await jobRepo.getJobSplit(jobId);

    expect(split?.partsChargedPaisa).toBe(2440);
    expect(split?.partsCostPaisa).toBe(1982);
    expect(split?.partsMarginPaisa).toBe(458);
    expect(split?.labourChargePaisa).toBe(150000);
    expect(split?.totalBillPaisa).toBe(152440);
  });

  it('a job with no delivery yet shows zero for every money figure', async () => {
    const jobId = insertJob({ doc_no: 'JOB-0002' });

    const split = await jobRepo.getJobSplit(jobId);

    expect(split?.partsChargedPaisa).toBe(0);
    expect(split?.partsCostPaisa).toBe(0);
    expect(split?.partsMarginPaisa).toBe(0);
    expect(split?.labourChargePaisa).toBe(0);
    expect(split?.totalBillPaisa).toBe(0);
  });

  it('a delivered part line alone (no labour) computes real margin', async () => {
    const jobId = insertJob({ doc_no: 'JOB-0003' });
    insertDeliveredSale(jobId, [
      {
        lineKind: 'part',
        itemId: compressorItemId,
        quantity: 1000,
        unitPrice: 1500000,
        unitCost: 900000,
      },
    ]);

    const split = await jobRepo.getJobSplit(jobId);

    // charged = 1,500,000 x 1000/1000 = 1,500,000
    // cost    =   900,000 x 1000/1000 =   900,000
    // margin  = 1,500,000 - 900,000   =   600,000
    expect(split?.partsChargedPaisa).toBe(1500000);
    expect(split?.partsCostPaisa).toBe(900000);
    expect(split?.partsMarginPaisa).toBe(600000);
    expect(split?.labourChargePaisa).toBe(0);
  });

  it('returns null for an unknown job id', async () => {
    const split = await jobRepo.getJobSplit(newId());
    expect(split).toBeNull();
  });
});

describe('KyselyJobRepository.getTechnicianCustody', () => {
  it('sums stock_movement in exact milli-units, not a float division', async () => {
    // Shop -> Naeem: 500g gas issued (transfer_in to his warehouse)
    insertStockMovement(technicianWarehouseId, gasItemId, 500_000, 'transfer_in');
    // Naeem -> Job: 200g consumed (job_issue, negative)
    insertStockMovement(technicianWarehouseId, gasItemId, -200_000, 'job_issue');

    const rows = await jobRepo.getTechnicianCustody(technicianPartyId);

    // 500,000 - 200,000 = 300,000 milli-units (0.3 kg) — exact integer,
    // not 0.3 as a float from a SQL-side /1000.0 division.
    const gasRow = rows.find((r) => r.itemId === gasItemId);
    expect(gasRow?.qtyHeldMilli).toBe(300_000);
    expect(Number.isInteger(gasRow?.qtyHeldMilli)).toBe(true);
    expect(gasRow?.warehouseId).toBe(technicianWarehouseId);
  });

  it('excludes movements in non-technician warehouses', async () => {
    insertStockMovement(shopWarehouseId, compressorItemId, 5000, 'opening');

    const rows = await jobRepo.getTechnicianCustody(technicianPartyId);

    expect(rows.find((r) => r.itemId === compressorItemId)).toBeUndefined();
  });

  it('omits an item whose net balance has returned to zero', async () => {
    insertStockMovement(technicianWarehouseId, compressorItemId, 1000, 'transfer_in');
    insertStockMovement(technicianWarehouseId, compressorItemId, -1000, 'job_issue');

    const rows = await jobRepo.getTechnicianCustody(technicianPartyId);

    expect(rows.find((r) => r.itemId === compressorItemId)).toBeUndefined();
  });
});

describe('KyselyJobRepository.createJob', () => {
  it('generates JOB-NNNN doc_no, inserts one job_status_history row (received), audit_log, sync_outbox', async () => {
    const result = await jobRepo.createJob({
      customerId,
      customerNameAdhoc: null,
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: 'Fridge',
      applianceBrand: 'Dawlance',
      applianceModel: null,
      applianceSerial: null,
      reportedFault: 'Not cooling',
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: technicianPartyId,
      notes: null,
    });

    // First job on a fresh DB: nextNumber=1 -> 'JOB-0001'
    expect(result.docNo).toBe('JOB-0001');
    expect(result.status).toBe('received');
    expect(result.customerId).toBe(customerId);

    const jobRow = rawDb.prepare(`SELECT status FROM job WHERE id = ?`).get(result.id) as {
      status: string;
    };
    // The column itself is set once, at creation, to 'received'.
    expect(jobRow.status).toBe('received');

    const history = rawDb
      .prepare(`SELECT from_status, to_status FROM job_status_history WHERE job_id = ?`)
      .all(result.id) as Array<{ from_status: string | null; to_status: string }>;
    expect(history).toHaveLength(1);
    expect(history[0]?.from_status).toBeNull();
    expect(history[0]?.to_status).toBe('received');

    const auditRows = rawDb
      .prepare(`SELECT * FROM audit_log WHERE table_name = 'job' AND record_id = ?`)
      .all(result.id);
    expect(auditRows).toHaveLength(1);

    const outboxRows = rawDb
      .prepare(`SELECT * FROM sync_outbox WHERE table_name = 'job' AND record_id = ?`)
      .all(result.id);
    expect(outboxRows).toHaveLength(1);
  });

  it('second job on the same tenant gets JOB-0002', async () => {
    await jobRepo.createJob({
      customerId: null,
      customerNameAdhoc: 'Walk-in',
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: null,
      applianceBrand: null,
      applianceModel: null,
      applianceSerial: null,
      reportedFault: null,
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: null,
      notes: null,
    });
    const second = await jobRepo.createJob({
      customerId: null,
      customerNameAdhoc: 'Walk-in 2',
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: null,
      applianceBrand: null,
      applianceModel: null,
      applianceSerial: null,
      reportedFault: null,
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: null,
      notes: null,
    });

    expect(second.docNo).toBe('JOB-0002');
  });

  it('round-trips estimateAmountPaisa and applianceSerial, estimateApproved starts false', async () => {
    const result = await jobRepo.createJob({
      customerId,
      customerNameAdhoc: null,
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: 'AC',
      applianceBrand: 'Gree',
      applianceModel: 'GS-12',
      applianceSerial: 'SN-12345',
      reportedFault: 'Not cooling',
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: 500000, // Rs 5,000
      assignedTo: null,
      notes: null,
    });

    expect(result.applianceSerial).toBe('SN-12345');
    expect(result.estimateAmountPaisa).toBe(500000);
    expect(result.estimateApproved).toBe(false);

    const refetched = await jobRepo.getJob(result.id);
    expect(refetched?.applianceSerial).toBe('SN-12345');
    expect(refetched?.estimateAmountPaisa).toBe(500000);
    expect(refetched?.estimateApproved).toBe(false);
  });
});

describe('KyselyJobRepository.updateJobStatus', () => {
  it('inserts a new job_status_history row and leaves job.status column untouched', async () => {
    const created = await jobRepo.createJob({
      customerId,
      customerNameAdhoc: null,
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: null,
      applianceBrand: null,
      applianceModel: null,
      applianceSerial: null,
      reportedFault: null,
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: technicianPartyId,
      notes: null,
    });

    const updated = await jobRepo.updateJobStatus({
      jobId: created.id,
      toStatus: 'in_progress',
      note: 'Technician started work',
    });

    // Derived status reflects the transition immediately.
    expect(updated.status).toBe('in_progress');

    // The raw job.status COLUMN was never touched — still 'received',
    // proving this is genuinely an INSERT-only operation, not an UPDATE.
    const jobRow = rawDb.prepare(`SELECT status FROM job WHERE id = ?`).get(created.id) as {
      status: string;
    };
    expect(jobRow.status).toBe('received');

    const history = rawDb
      .prepare(
        `SELECT from_status, to_status, note FROM job_status_history WHERE job_id = ? ORDER BY changed_at`,
      )
      .all(created.id) as Array<{
      from_status: string | null;
      to_status: string;
      note: string | null;
    }>;
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ from_status: null, to_status: 'received', note: null });
    expect(history[1]).toEqual({
      from_status: 'received',
      to_status: 'in_progress',
      note: 'Technician started work',
    });

    // getJob independently confirms the same derived status.
    const refetched = await jobRepo.getJob(created.id);
    expect(refetched?.status).toBe('in_progress');
  });

  it('throws for an unknown job id', async () => {
    await expect(
      jobRepo.updateJobStatus({ jobId: newId(), toStatus: 'in_progress', note: null }),
    ).rejects.toThrow();
  });
});

describe('KyselyJobRepository.assignTechnician', () => {
  it('updates job.assigned_to directly (job is not an append-only table)', async () => {
    const created = await jobRepo.createJob({
      customerId,
      customerNameAdhoc: null,
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: null,
      applianceBrand: null,
      applianceModel: null,
      applianceSerial: null,
      reportedFault: null,
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: null,
      notes: null,
    });
    expect(created.assignedTo).toBeNull();

    const otherTechId = newId();
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_code, party_type, name, staff_role, is_active, created_at, updated_at)
         VALUES (?, ?, 'STF-0003', 'staff', 'Bilal', 'technician', 1, ?, ?)`,
      )
      .run(otherTechId, TENANT_ID, now, now);

    const updated = await jobRepo.assignTechnician({
      jobId: created.id,
      technicianPartyId: otherTechId,
    });

    expect(updated.assignedTo).toBe(otherTechId);

    const jobRow = rawDb.prepare(`SELECT assigned_to FROM job WHERE id = ?`).get(created.id) as {
      assigned_to: string;
    };
    expect(jobRow.assigned_to).toBe(otherTechId);
  });
});
