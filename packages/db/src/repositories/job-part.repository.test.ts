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
import { KyselyJobPartRepository } from './job-part.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyJobPartRepository;

let partsUnitId: string;
let repairUnitId: string;
let shopWarehouseId: string;
let technicianWarehouseId: string;
let technicianPartyId: string;
let gasItemId: string;

function insertOpeningStock(warehouseId: string, itemId: string, quantityMilli: number): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, source_type, source_id, reason, reversed_by_id, created_at, created_by, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'opening', ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, ?)`,
    )
    .run(newId(), TENANT_ID, itemId, warehouseId, now, quantityMilli, now, partsUnitId);
}

function stockOnHand(warehouseId: string, itemId: string): number {
  const row = rawDb
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS qty FROM stock_movement WHERE warehouse_id = ? AND item_id = ?`,
    )
    .get(warehouseId, itemId) as { qty: number };
  return row.qty;
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-job-part-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyJobPartRepository(kysely, TENANT_ID, DEVICE_CODE);

  const partsUnit = rawDb
    .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
    .get(TENANT_ID) as { id: string };
  partsUnitId = partsUnit.id;
  const repairUnit = rawDb
    .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'REPAIR'`)
    .get(TENANT_ID) as { id: string };
  repairUnitId = repairUnit.id;

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
      `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, avg_cost, created_at, updated_at)
       VALUES (?, ?, 'ITM-0002', 'Refrigerant Gas', ?, ?, 1680, ?, ?)`,
    )
    .run(newId(), TENANT_ID, partsUnitId, kgUom.id, now, now);
  gasItemId = (
    rawDb.prepare(`SELECT id FROM item WHERE item_code = 'ITM-0002'`).get() as { id: string }
  ).id;

  // Rs 840/kg -> avg_cost = 1680 paisa per 0.5... actually store per-kg:
  // avg_cost is paisa PER STOCK UNIT (kg here). Rs 840/kg = 84,000 paisa/kg.
  rawDb.prepare(`UPDATE item SET avg_cost = 84000 WHERE id = ?`).run(gasItemId);

  insertOpeningStock(shopWarehouseId, gasItemId, 5_000_000); // 5 kg opening stock
});

function insertJob(): string {
  const jobId = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO job (id, tenant_id, doc_no, job_type, received_date, assigned_to, status, labour_charge, parts_cost, total_charge, warranty_days, is_warranty_rework, revenue_type, created_at, updated_at)
       VALUES (?, ?, 'JOB-0001', 'in_shop', '2026-09-05', ?, 'received', 0, 0, 0, 0, 0, 'customer_paid', ?, ?)`,
    )
    .run(jobId, TENANT_ID, technicianPartyId, now, now);
  return jobId;
}

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyJobPartRepository.issuePartsToTechnician', () => {
  it('posts transfer_out (shop, negative) + transfer_in (technician, positive), balances move by exactly 500g', async () => {
    const before = stockOnHand(shopWarehouseId, gasItemId);
    expect(before).toBe(5_000_000);

    const result = await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 500_000, // 500g
      fromWarehouseId: null, // default Shop warehouse
      technicianPartyId,
    });

    expect(result.quantityMilli).toBe(500_000);
    expect(result.fromWarehouseId).toBe(shopWarehouseId);
    expect(result.toWarehouseId).toBe(technicianWarehouseId);

    // 5,000,000 - 500,000 = 4,500,000 milli (4.5 kg) left in Shop
    expect(stockOnHand(shopWarehouseId, gasItemId)).toBe(4_500_000);
    // Naeem now holds exactly 500,000 milli (0.5 kg)
    expect(stockOnHand(technicianWarehouseId, gasItemId)).toBe(500_000);

    const movements = rawDb
      .prepare(
        `SELECT movement_type, warehouse_id, quantity, unit_cost FROM stock_movement WHERE item_id = ? AND movement_type IN ('transfer_out','transfer_in') ORDER BY movement_type`,
      )
      .all(gasItemId) as Array<{
      movement_type: string;
      warehouse_id: string;
      quantity: number;
      unit_cost: number | null;
    }>;
    expect(movements).toHaveLength(2);
    const out = movements.find((m) => m.movement_type === 'transfer_out');
    const inMove = movements.find((m) => m.movement_type === 'transfer_in');
    expect(out?.warehouse_id).toBe(shopWarehouseId);
    expect(out?.quantity).toBe(-500_000);
    expect(out?.unit_cost).toBe(84000);
    expect(inMove?.warehouse_id).toBe(technicianWarehouseId);
    expect(inMove?.quantity).toBe(500_000);
    expect(inMove?.unit_cost).toBe(84000);

    const auditRows = rawDb
      .prepare(`SELECT * FROM audit_log WHERE table_name = 'stock_movement'`)
      .all();
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it('lazily creates a technician warehouse when the technician has none yet', async () => {
    const newTechId = newId();
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_code, party_type, name, staff_role, is_active, created_at, updated_at)
         VALUES (?, ?, 'STF-0002', 'staff', 'Bilal', 'technician', 1, ?, ?)`,
      )
      .run(newTechId, TENANT_ID, now, now);

    const result = await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 200_000,
      fromWarehouseId: null,
      technicianPartyId: newTechId,
    });

    const warehouseRow = rawDb
      .prepare(`SELECT warehouse_kind, custodian_party_id FROM warehouse WHERE id = ?`)
      .get(result.toWarehouseId) as { warehouse_kind: string; custodian_party_id: string };
    expect(warehouseRow.warehouse_kind).toBe('technician');
    expect(warehouseRow.custodian_party_id).toBe(newTechId);
    expect(stockOnHand(result.toWarehouseId, gasItemId)).toBe(200_000);
  });

  it('reuses the existing technician warehouse on a second issue, not creating a duplicate', async () => {
    await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 100_000,
      fromWarehouseId: null,
      technicianPartyId,
    });
    await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 150_000,
      fromWarehouseId: null,
      technicianPartyId,
    });

    const warehouseCount = rawDb
      .prepare(
        `SELECT COUNT(*) AS c FROM warehouse WHERE custodian_party_id = ? AND warehouse_kind = 'technician'`,
      )
      .get(technicianPartyId) as { c: number };
    expect(warehouseCount.c).toBe(1);

    // 100,000 + 150,000 = 250,000
    expect(stockOnHand(technicianWarehouseId, gasItemId)).toBe(250_000);
  });
});

describe('KyselyJobPartRepository.issuePartsToJob', () => {
  it('hand-calc from PHASE_6.md P6-4: issue 500g to Naeem, then 200g to a job — 300g remains', async () => {
    await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 500_000,
      fromWarehouseId: null,
      technicianPartyId,
    });
    const jobId = insertJob();

    const result = await repo.issuePartsToJob({
      jobId,
      itemId: gasItemId,
      quantityMilli: 200_000,
      technicianPartyId,
      unitPricePaisa: 100000, // Rs 1,000/kg charged to customer, explicit override
      isBillable: true,
    });

    expect(result.quantityMilli).toBe(200_000);
    expect(result.unitCostPaisa).toBe(84000); // snapshot of item.avg_cost
    expect(result.unitPricePaisa).toBe(100000);

    const jobPartRow = rawDb
      .prepare(
        `SELECT job_id, item_id, quantity, unit_cost, unit_price, business_unit_id, is_billable, entry_type, reverses_job_part_id
         FROM job_part WHERE id = ?`,
      )
      .get(result.jobPartId) as {
      job_id: string;
      item_id: string;
      quantity: number;
      unit_cost: number;
      unit_price: number;
      business_unit_id: string;
      is_billable: number;
      entry_type: string;
      reverses_job_part_id: string | null;
    };
    expect(jobPartRow.job_id).toBe(jobId);
    expect(jobPartRow.quantity).toBe(200_000);
    expect(jobPartRow.unit_cost).toBe(84000);
    expect(jobPartRow.entry_type).toBe('issue');
    expect(jobPartRow.reverses_job_part_id).toBeNull();
    expect(jobPartRow.is_billable).toBe(1);
    expect(jobPartRow.business_unit_id).toBe(partsUnitId);

    const movement = rawDb
      .prepare(
        `SELECT movement_type, warehouse_id, quantity, source_type, source_id, business_unit_id FROM stock_movement WHERE movement_type = 'job_issue'`,
      )
      .get() as {
      movement_type: string;
      warehouse_id: string;
      quantity: number;
      source_type: string;
      source_id: string;
      business_unit_id: string;
    };
    expect(movement.warehouse_id).toBe(technicianWarehouseId);
    expect(movement.quantity).toBe(-200_000);
    expect(movement.source_type).toBe('job_part');
    expect(movement.source_id).toBe(result.jobPartId);
    // stock_movement.business_unit_id records which unit CAUSED the
    // movement (0002_business_units.sql's comment) — REPAIR consumed
    // the gas, even though the item itself belongs to PARTS.
    expect(movement.business_unit_id).toBe(repairUnitId);

    // 500,000 (issued) - 200,000 (to job) = 300,000 milli (0.3 kg) remaining
    expect(stockOnHand(technicianWarehouseId, gasItemId)).toBe(300_000);
  });

  it('EC-4 pre-condition: job parts issued do NOT appear in v_daily_sales', async () => {
    await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 500_000,
      fromWarehouseId: null,
      technicianPartyId,
    });
    const jobId = insertJob();
    await repo.issuePartsToJob({
      jobId,
      itemId: gasItemId,
      quantityMilli: 200_000,
      technicianPartyId,
      unitPricePaisa: 100000,
      isBillable: true,
    });

    const dailySalesRows = rawDb
      .prepare(`SELECT * FROM v_daily_sales WHERE sale_date = '2026-09-05'`)
      .all();
    // No `sale` row was ever created by issuePartsToTechnician or
    // issuePartsToJob — v_daily_sales reads from `sale`, not
    // stock_movement, so it is empty by construction. Confirmed by
    // actually running the query, not assumed from reading the view SQL.
    expect(dailySalesRows).toHaveLength(0);
  });

  it('resolves unitPricePaisa via the default Retail price when no override is given', async () => {
    await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 500_000,
      fromWarehouseId: null,
      technicianPartyId,
    });
    const jobId = insertJob();

    const retailLevel = rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND name = 'Retail'`)
      .get(TENANT_ID) as { id: string };
    rawDb
      .prepare(
        `INSERT INTO item_price (id, tenant_id, item_id, price_level_id, price, effective_from, created_at)
         VALUES (?, ?, ?, ?, 95000, '2026-08-01', ?)`,
      )
      .run(newId(), TENANT_ID, gasItemId, retailLevel.id, new Date().toISOString());

    const result = await repo.issuePartsToJob({
      jobId,
      itemId: gasItemId,
      quantityMilli: 100_000,
      technicianPartyId,
      unitPricePaisa: null,
      isBillable: true,
    });

    expect(result.unitPricePaisa).toBe(95000);
  });

  it('throws when the item has no avg_cost — job_part.unit_cost is NOT NULL, unlike sale_line', async () => {
    const kgUom = rawDb
      .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`)
      .get(TENANT_ID) as { id: string };
    const now = new Date().toISOString();
    const noCostItemId = newId();
    rawDb
      .prepare(
        `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, created_at, updated_at)
         VALUES (?, ?, 'ITM-0003', 'Never Purchased Item', ?, ?, ?, ?)`,
      )
      .run(noCostItemId, TENANT_ID, partsUnitId, kgUom.id, now, now);
    insertOpeningStock(technicianWarehouseId, noCostItemId, 1000);
    const jobId = insertJob();

    await expect(
      repo.issuePartsToJob({
        jobId,
        itemId: noCostItemId,
        quantityMilli: 1000,
        technicianPartyId,
        unitPricePaisa: 5000,
        isBillable: true,
      }),
    ).rejects.toThrow(/avg_cost/);
  });
});

describe('KyselyJobPartRepository.listJobParts', () => {
  it('returns every job_part row (issue and return), entry_type included, no netting done in SQL', async () => {
    await repo.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 500_000,
      fromWarehouseId: null,
      technicianPartyId,
    });
    const jobId = insertJob();

    const issued = await repo.issuePartsToJob({
      jobId,
      itemId: gasItemId,
      quantityMilli: 200_000,
      technicianPartyId,
      unitPricePaisa: 100000,
      isBillable: true,
    });

    // Return 50g unused — raw insert, matching the same pattern
    // custody.repository.test.ts's EC-3 walkthrough already uses (no
    // production "return parts" method exists yet — job.returnPart is a
    // logged gap, see PROJECT.md).
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO job_part (id, tenant_id, job_id, item_id, quantity, unit_cost, unit_price, is_returned, issued_at, business_unit_id, is_billable, entry_type, reverses_job_part_id)
         VALUES (?, ?, ?, ?, 50000, 84000, 100000, 0, ?, ?, 1, 'return', ?)`,
      )
      .run(newId(), TENANT_ID, jobId, gasItemId, now, partsUnitId, issued.jobPartId);

    const rows = await repo.listJobParts(jobId);

    expect(rows).toHaveLength(2);
    const issueRow = rows.find((r) => r.entryType === 'issue');
    const returnRow = rows.find((r) => r.entryType === 'return');
    expect(issueRow?.quantityMilli).toBe(200_000);
    expect(issueRow?.itemId).toBe(gasItemId);
    expect(issueRow?.itemName).toBe('Refrigerant Gas');
    expect(issueRow?.unitPricePaisa).toBe(100000);
    expect(issueRow?.reversesJobPartId).toBeNull();
    expect(returnRow?.quantityMilli).toBe(50_000);
    expect(returnRow?.reversesJobPartId).toBe(issued.jobPartId);
  });

  it('returns an empty array for a job with no parts issued', async () => {
    const jobId = insertJob();

    const rows = await repo.listJobParts(jobId);

    expect(rows).toEqual([]);
  });
});
