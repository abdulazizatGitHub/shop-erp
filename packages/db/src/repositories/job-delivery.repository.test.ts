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
import { KyselyJobPartRepository } from './job-part.repository.js';
import { KyselyJobDeliveryRepository } from './job-delivery.repository.js';
import { getSaleReceiptData } from './receipt.repository.js';
import { getSaleInvoiceData } from './invoice.repository.js';
import { deliverJob, buildInvoiceLayout } from '@shop/core';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let deliveryRepo: KyselyJobDeliveryRepository;
let jobPartRepo: KyselyJobPartRepository;
let partyRepo: KyselyPartyRepository;

let partsUnitId: string;
let repairUnitId: string;
let technicianPartyId: string;
let customerId: string;
let dawlanceId: string;
let pipeItemId: string;
let compressorItemId: string;
let serviceChargeId: string;

function insertJob(customer: string | null): string {
  const jobId = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO job (id, tenant_id, doc_no, customer_id, job_type, received_date, assigned_to, status, labour_charge, parts_cost, total_charge, warranty_days, is_warranty_rework, revenue_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_shop', '2026-09-05', ?, 'received', 0, 0, 0, 0, 0, 'customer_paid', ?, ?)`,
    )
    .run(jobId, TENANT_ID, `JOB-${jobId.slice(0, 4)}`, customer, technicianPartyId, now, now);
  rawDb
    .prepare(
      `INSERT INTO job_status_history (id, tenant_id, job_id, from_status, to_status, changed_at)
       VALUES (?, ?, ?, NULL, 'received', ?)`,
    )
    .run(newId(), TENANT_ID, jobId, now);
  return jobId;
}

function stockMovementCount(): number {
  const row = rawDb.prepare(`SELECT COUNT(*) AS c FROM stock_movement`).get() as { c: number };
  return row.c;
}

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-job-delivery-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  kysely = createKyselyDb(rawDb);
  deliveryRepo = new KyselyJobDeliveryRepository(kysely, TENANT_ID, DEVICE_CODE);
  jobPartRepo = new KyselyJobPartRepository(kysely, TENANT_ID, DEVICE_CODE);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);

  partsUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  repairUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'REPAIR'`)
      .get(TENANT_ID) as { id: string }
  ).id;

  const kgUom = rawDb
    .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`)
    .get(TENANT_ID) as { id: string };
  const pieceUom = rawDb
    .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`)
    .get(TENANT_ID) as { id: string };

  const now = new Date().toISOString();

  technicianPartyId = newId();
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, staff_role, is_active, created_at, updated_at)
       VALUES (?, ?, 'STF-0001', 'staff', 'Naeem', 'technician', 1, ?, ?)`,
    )
    .run(technicianPartyId, TENANT_ID, now, now);
  const technicianWarehouseId = newId();
  rawDb
    .prepare(
      `INSERT INTO warehouse (id, tenant_id, name, is_default, warehouse_kind, custodian_party_id)
       VALUES (?, ?, 'Naeem - Technician', 0, 'technician', ?)`,
    )
    .run(technicianWarehouseId, TENANT_ID, technicianPartyId);

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

  dawlanceId = newId();
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, is_active, created_at, updated_at)
       VALUES (?, ?, 'SUP-0099', 'both', 'Dawlance', 1, ?, ?)`,
    )
    .run(dawlanceId, TENANT_ID, now, now);

  // Copper pipe: cost Rs 6.50/kg = 650 paisa, sold at Rs 8.00/kg = 800 paisa.
  pipeItemId = newId();
  rawDb
    .prepare(
      `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, avg_cost, created_at, updated_at)
       VALUES (?, ?, 'ITM-PIPE', 'Copper Pipe', ?, ?, 650, ?, ?)`,
    )
    .run(pipeItemId, TENANT_ID, partsUnitId, kgUom.id, now, now);
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, created_at, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'transfer_in', 10000, 650, ?, ?)`,
    )
    .run(newId(), TENANT_ID, pipeItemId, technicianWarehouseId, now, now, partsUnitId);

  compressorItemId = newId();
  rawDb
    .prepare(
      `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, avg_cost, created_at, updated_at)
       VALUES (?, ?, 'ITM-COMP', 'Compressor', ?, ?, 900000, ?, ?)`,
    )
    .run(compressorItemId, TENANT_ID, partsUnitId, pieceUom.id, now, now);
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, created_at, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'transfer_in', 5000, 900000, ?, ?)`,
    )
    .run(newId(), TENANT_ID, compressorItemId, technicianWarehouseId, now, now, partsUnitId);

  serviceChargeId = newId();
  rawDb
    .prepare(
      `INSERT INTO service_charge (id, tenant_id, business_unit_id, name, retail_charge, is_active, created_at)
       VALUES (?, ?, ?, 'AC Installation', 150000, 1, ?)`,
    )
    .run(serviceChargeId, TENANT_ID, repairUnitId, now);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyJobDeliveryRepository.deliverJob — EC-1 hand check', () => {
  it('an installation job splits correctly: pipe -> Spare Parts, labour -> Repair', async () => {
    const jobId = insertJob(customerId);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 3050, // 3.05 kg
      technicianPartyId,
      unitPricePaisa: 800, // Rs 8.00/kg
      isBillable: true,
    });
    const movementsBeforeDelivery = stockMovementCount();

    const result = await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 800,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      labourLines: [
        {
          serviceChargeId,
          unitPricePaisa: null, // resolve from service_charge.retail_charge = 150000
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      paidPaisa: 0,
    });

    // line_total(pipe)   = 800 x 3050 / 1000 = 2440
    // line_total(labour) = 150000 x 1000 / 1000 = 150000
    // total = 2440 + 150000 = 152440
    expect(result.totalAmountPaisa).toBe(152440);
    expect(result.docNo).toBe('INV-0001');

    // CRITICAL: no stock_movement is created for the delivery — P6-4's
    // job_issue movement (posted inside issuePartsToJob above) is the
    // only physical stock event. Confirmed by an exact count, not by
    // absence of a specific row.
    expect(stockMovementCount()).toBe(movementsBeforeDelivery);

    const lines = rawDb
      .prepare(
        `SELECT item_id, quantity, unit_price, unit_cost, line_total, business_unit_id, line_kind, job_part_id, service_charge_id, payer_party_id, revenue_type
         FROM sale_line WHERE sale_id = ? ORDER BY line_no`,
      )
      .all(result.id) as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);

    const partLine = lines[0] as Record<string, unknown>;
    expect(partLine['item_id']).toBe(pipeItemId);
    expect(partLine['quantity']).toBe(3050);
    expect(partLine['unit_price']).toBe(800);
    expect(partLine['unit_cost']).toBe(650); // copied from job_part, not re-derived
    expect(partLine['line_total']).toBe(2440);
    expect(partLine['business_unit_id']).toBe(partsUnitId);
    expect(partLine['line_kind']).toBe('part');
    expect(partLine['job_part_id']).toBe(jobPart.jobPartId);
    expect(partLine['service_charge_id']).toBeNull();

    const labourLine = lines[1] as Record<string, unknown>;
    expect(labourLine['item_id']).toBeNull();
    expect(labourLine['unit_cost']).toBe(0);
    expect(labourLine['line_total']).toBe(150000);
    expect(labourLine['business_unit_id']).toBe(repairUnitId);
    expect(labourLine['line_kind']).toBe('labour');
    expect(labourLine['job_part_id']).toBeNull();
    expect(labourLine['service_charge_id']).toBe(serviceChargeId);

    // Single payer, fully credit (paidPaisa=0): outstanding = 152440.
    const ledgerRows = rawDb
      .prepare(`SELECT amount FROM party_ledger WHERE party_id = ?`)
      .all(customerId) as Array<{ amount: number }>;
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.amount).toBe(152440);

    const jobRow = rawDb.prepare(`SELECT sale_id, status FROM job WHERE id = ?`).get(jobId) as {
      sale_id: string;
      status: string;
    };
    expect(jobRow.sale_id).toBe(result.id);
    // job.status column itself is NEVER updated — still 'received'.
    expect(jobRow.status).toBe('received');

    const history = rawDb
      .prepare(
        `SELECT from_status, to_status FROM job_status_history WHERE job_id = ? ORDER BY changed_at`,
      )
      .all(jobId) as Array<{ from_status: string | null; to_status: string }>;
    expect(history).toHaveLength(2);
    expect(history[1]).toEqual({ from_status: 'received', to_status: 'delivered' });

    const saleRow = rawDb
      .prepare(`SELECT job_id, sale_type, status FROM sale WHERE id = ?`)
      .get(result.id) as {
      job_id: string;
      sale_type: string;
      status: string;
    };
    expect(saleRow.job_id).toBe(jobId);
    expect(saleRow.sale_type).toBe('job');
    expect(saleRow.status).toBe('confirmed');
  });

  it('EC-1: v_job_split and v_unit_pl report the exact hand-calculated numbers', async () => {
    const jobId = insertJob(customerId);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 3050,
      technicianPartyId,
      unitPricePaisa: 800,
      isBillable: true,
    });
    await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 800,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
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

    const split = rawDb
      .prepare(
        `SELECT parts_charged_paisa, parts_cost_paisa, parts_margin_paisa, labour_charge_paisa, total_bill_paisa FROM v_job_split WHERE job_id = ?`,
      )
      .get(jobId) as Record<string, number>;
    // Hand-calc (written before running): charged=2440, cost=1982
    // (1,982,500 / 1000 truncated), margin=458, labour=150000, total=152440
    expect(split['parts_charged_paisa']).toBe(2440);
    expect(split['parts_cost_paisa']).toBe(1982);
    expect(split['parts_margin_paisa']).toBe(458);
    expect(split['labour_charge_paisa']).toBe(150000);
    expect(split['total_bill_paisa']).toBe(152440);

    const unitPl = rawDb
      .prepare(
        `SELECT unit_code, line_kind, revenue_paisa, cogs_paisa, gross_margin_paisa FROM v_unit_pl WHERE tenant_id = ? AND sale_date = '2026-09-05' ORDER BY unit_code`,
      )
      .all(TENANT_ID) as Array<Record<string, unknown>>;
    const partsRow = unitPl.find((r) => r['unit_code'] === 'PARTS');
    const repairRow = unitPl.find((r) => r['unit_code'] === 'REPAIR');
    expect(partsRow?.['revenue_paisa']).toBe(2440);
    expect(partsRow?.['cogs_paisa']).toBe(1982);
    expect(partsRow?.['gross_margin_paisa']).toBe(458);
    expect(repairRow?.['revenue_paisa']).toBe(150000);
    expect(repairRow?.['cogs_paisa']).toBe(0);
    expect(repairRow?.['gross_margin_paisa']).toBe(150000);
  });
});

describe('KyselyJobDeliveryRepository.deliverJob — EC-2 hand check', () => {
  it('a Dawlance job bills labour to Dawlance and extra pipe to the customer, each party sees only their own share', async () => {
    const jobId = insertJob(customerId);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 3050,
      technicianPartyId,
      unitPricePaisa: 800,
      isBillable: true,
    });

    await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 800,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      labourLines: [
        {
          serviceChargeId,
          unitPricePaisa: 120000, // Rs 1200, override for the Dawlance contract rate
          payerPartyId: dawlanceId,
          revenueType: 'contract',
        },
      ],
      paidPaisa: 0,
    });

    const dawlanceLedger = rawDb
      .prepare(`SELECT amount FROM party_ledger WHERE party_id = ?`)
      .all(dawlanceId) as Array<{ amount: number }>;
    const customerLedger = rawDb
      .prepare(`SELECT amount FROM party_ledger WHERE party_id = ?`)
      .all(customerId) as Array<{ amount: number }>;

    expect(dawlanceLedger).toHaveLength(1);
    expect(dawlanceLedger[0]?.amount).toBe(120000);
    expect(customerLedger).toHaveLength(1);
    expect(customerLedger[0]?.amount).toBe(2440);
    // Neither party's row shows the combined 122440 — proves the split
    // is real, not just the job's total posted twice.
    expect(dawlanceLedger[0]?.amount).not.toBe(122440);
    expect(customerLedger[0]?.amount).not.toBe(122440);
  });

  it('throws when multiple payers and paidPaisa > 0 — enforced by job-delivery.service.ts, called through the real service+repository chain, not just the pure function in isolation', async () => {
    const jobId = insertJob(customerId);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 3050,
      technicianPartyId,
      unitPricePaisa: 800,
      isBillable: true,
    });

    await expect(
      deliverJob(deliveryRepo, {
        jobId,
        saleDate: '2026-09-05',
        partLines: [
          {
            jobPartId: jobPart.jobPartId,
            unitPricePaisa: 800,
            payerPartyId: customerId,
            revenueType: 'customer_paid',
          },
        ],
        labourLines: [
          {
            serviceChargeId,
            unitPricePaisa: 120000,
            payerPartyId: dawlanceId,
            revenueType: 'contract',
          },
        ],
        paidPaisa: 1000,
      }),
    ).rejects.toThrow(/multiple payers/i);

    // Confirmed the rejection happened BEFORE any write — no sale was created.
    const sales = rawDb.prepare(`SELECT * FROM sale`).all();
    expect(sales).toHaveLength(0);
  });
});

describe('KyselyJobDeliveryRepository.deliverJob — other cases', () => {
  it('walk-in payer (payerPartyId=null) creates no party_ledger row', async () => {
    const jobId = insertJob(null);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: compressorItemId,
      quantityMilli: 1000,
      technicianPartyId,
      unitPricePaisa: 1500000,
      isBillable: true,
    });

    const result = await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 1500000,
          payerPartyId: null,
          revenueType: 'customer_paid',
        },
      ],
      labourLines: [],
      paidPaisa: 1500000,
    });

    expect(result.totalAmountPaisa).toBe(1500000);
    const ledgerRows = rawDb.prepare(`SELECT * FROM party_ledger`).all();
    expect(ledgerRows).toHaveLength(0);

    const saleRow = rawDb.prepare(`SELECT customer_id FROM sale WHERE id = ?`).get(result.id) as {
      customer_id: string | null;
    };
    expect(saleRow.customer_id).toBeNull();
  });

  it('EC-4, positive half: the delivered invoice DOES appear in v_daily_sales, exactly once, matching the invoice total', async () => {
    const jobId = insertJob(customerId);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 3050,
      technicianPartyId,
      unitPricePaisa: 800,
      isBillable: true,
    });

    const result = await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 800,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
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

    const dailySalesRows = rawDb
      .prepare(
        `SELECT invoice_count, total_sales_paisa, credit_given_paisa FROM v_daily_sales WHERE sale_date = '2026-09-05'`,
      )
      .all() as Array<{
      invoice_count: number;
      total_sales_paisa: number;
      credit_given_paisa: number;
    }>;
    // Exactly one row for the date, one invoice, matching the delivery's
    // own total exactly — not duplicated, not phantom.
    expect(dailySalesRows).toHaveLength(1);
    expect(dailySalesRows[0]?.invoice_count).toBe(1);
    expect(dailySalesRows[0]?.total_sales_paisa).toBe(result.totalAmountPaisa);
    expect(dailySalesRows[0]?.total_sales_paisa).toBe(152440);
    // Fully credit (paidPaisa=0): all 152440 shows as credit given.
    expect(dailySalesRows[0]?.credit_given_paisa).toBe(152440);
  });

  it('never creates an internal_transfer row (ADR-0005)', async () => {
    const jobId = insertJob(customerId);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 1000,
      technicianPartyId,
      unitPricePaisa: 800,
      isBillable: true,
    });

    await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 800,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      labourLines: [],
      paidPaisa: 0,
    });

    const transfers = rawDb.prepare(`SELECT * FROM internal_transfer`).all();
    expect(transfers).toHaveLength(0);
  });
});

describe('P6-10: getSaleReceiptData/getSaleInvoiceData on a job delivery sale', () => {
  it('does not silently drop the labour line — regression for the item_id-NULL INNER JOIN bug', async () => {
    const jobId = insertJob(customerId);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 3050,
      technicianPartyId,
      unitPricePaisa: 800,
      isBillable: true,
    });
    const result = await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 800,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
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

    const receiptData = await getSaleReceiptData(kysely, TENANT_ID, result.id);
    // Before the LEFT JOIN fix, `JOIN item i ON i.id = sl.item_id` silently
    // excluded the labour line (item_id IS NULL), so this would have been 1.
    expect(receiptData?.lines).toHaveLength(2);

    const partLine = receiptData?.lines.find((l) => l.lineKind === 'part');
    expect(partLine?.itemName).toBe('Copper Pipe');
    expect(partLine?.lineTotalPaisa).toBe(2440);
    expect(partLine?.businessUnitName).toBe('Spare Parts');

    const labourLine = receiptData?.lines.find((l) => l.lineKind === 'labour');
    expect(labourLine?.itemName).toBe('AC Installation');
    expect(labourLine?.lineTotalPaisa).toBe(150000);
    expect(labourLine?.businessUnitName).toBe('Repair');
    // No item, no sale_uom_id -> unitName falls back to '', not a crash.
    expect(labourLine?.unitName).toBe('');
  });

  it('threads jobDocNo/reportedFault/technicianName, and buildInvoiceLayout groups the printed lines by business unit', async () => {
    const jobId = insertJob(customerId);
    rawDb.prepare(`UPDATE job SET reported_fault = ? WHERE id = ?`).run('Not cooling', jobId);
    const jobDocNo = (
      rawDb.prepare(`SELECT doc_no FROM job WHERE id = ?`).get(jobId) as { doc_no: string }
    ).doc_no;

    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: pipeItemId,
      quantityMilli: 3050,
      technicianPartyId,
      unitPricePaisa: 800,
      isBillable: true,
    });
    const result = await deliveryRepo.deliverJob({
      jobId,
      saleDate: '2026-09-05',
      partLines: [
        {
          jobPartId: jobPart.jobPartId,
          unitPricePaisa: 800,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      labourLines: [
        {
          serviceChargeId,
          unitPricePaisa: null,
          payerPartyId: customerId,
          revenueType: 'customer_paid',
        },
      ],
      paidPaisa: 152440,
    });

    const invoiceData = await getSaleInvoiceData(kysely, TENANT_ID, result.id);
    expect(invoiceData?.jobDocNo).toBe(jobDocNo);
    expect(invoiceData?.reportedFault).toBe('Not cooling');
    expect(invoiceData?.technicianName).toBe('Naeem'); // insertJob always sets assigned_to = technicianPartyId

    const layout = invoiceData ? buildInvoiceLayout(invoiceData) : '';
    expect(layout).toContain(`Job: ${jobDocNo}`);
    expect(layout).toContain('Fault: Not cooling');
    expect(layout).toContain('Technician: Naeem');
    expect(layout).toContain('-- Spare Parts --');
    expect(layout).toContain('-- Repair --');
    // Spare Parts group prints before Repair — order of first appearance
    // among the sale's own lines (part line inserted before labour line).
    expect(layout.indexOf('-- Spare Parts --')).toBeLessThan(layout.indexOf('-- Repair --'));
  });
});
