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
import { KyselyJobPartRepository } from './job-part.repository.js';
import { KyselyCustodyRepository } from './custody.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let custodyRepo: KyselyCustodyRepository;
let jobRepo: KyselyJobRepository;
let jobPartRepo: KyselyJobPartRepository;

let partsUnitId: string;
let technicianPartyId: string;
let technicianWarehouseId: string;
let gasItemId: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-custody-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  custodyRepo = new KyselyCustodyRepository(kysely, TENANT_ID, DEVICE_CODE);
  jobRepo = new KyselyJobRepository(kysely, TENANT_ID, DEVICE_CODE);
  jobPartRepo = new KyselyJobPartRepository(kysely, TENANT_ID, DEVICE_CODE);

  partsUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string }
  ).id;

  const kgUom = rawDb
    .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`)
    .get(TENANT_ID) as { id: string };
  const now = new Date().toISOString();

  technicianPartyId = newId();
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

  gasItemId = newId();
  // Rs 840/kg = 84,000 paisa/kg.
  rawDb
    .prepare(
      `INSERT INTO item (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id, avg_cost, created_at, updated_at)
       VALUES (?, ?, 'ITM-GAS', 'Refrigerant Gas', ?, ?, 84000, ?, ?)`,
    )
    .run(gasItemId, TENANT_ID, partsUnitId, kgUom.id, now, now);

  const shopWarehouseId = (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as { id: string }
  ).id;
  rawDb
    .prepare(
      `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, created_at, business_unit_id)
       VALUES (?, ?, ?, ?, ?, 'opening', 5000000, 84000, ?, ?)`,
    )
    .run(newId(), TENANT_ID, gasItemId, shopWarehouseId, now, now, partsUnitId);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

function custodyQtyMilli(): number {
  const row = rawDb
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS qty FROM stock_movement WHERE warehouse_id = ? AND item_id = ?`,
    )
    .get(technicianWarehouseId, gasItemId) as { qty: number };
  return row.qty;
}

describe('EC-3 — technician custody view shows exactly what a technician holds', () => {
  it('walks through issue, consume, return, and a reconciled shortage, matching PHASE_6.md §P6-7 exactly', async () => {
    // Step 1: issue 500g Shop -> Naeem.
    const jobPartRepoAsIssue = jobPartRepo;
    await jobPartRepoAsIssue.issuePartsToTechnician({
      itemId: gasItemId,
      quantityMilli: 500_000,
      fromWarehouseId: null,
      technicianPartyId,
    });
    expect(custodyQtyMilli()).toBe(500_000);
    let rows = await jobRepo.getTechnicianCustody(technicianPartyId);
    expect(rows.find((r) => r.itemId === gasItemId)?.qtyHeldMilli).toBe(500_000);

    // Step 2: create a job, issue 200g Naeem -> Job.
    const now = new Date().toISOString();
    const jobId = newId();
    rawDb
      .prepare(
        `INSERT INTO job (id, tenant_id, doc_no, job_type, received_date, assigned_to, status, labour_charge, parts_cost, total_charge, warranty_days, is_warranty_rework, revenue_type, created_at, updated_at)
         VALUES (?, ?, 'JOB-0001', 'in_shop', '2026-09-05', ?, 'received', 0, 0, 0, 0, 0, 'customer_paid', ?, ?)`,
      )
      .run(jobId, TENANT_ID, technicianPartyId, now, now);
    const jobPart = await jobPartRepo.issuePartsToJob({
      jobId,
      itemId: gasItemId,
      quantityMilli: 200_000,
      technicianPartyId,
      unitPricePaisa: 100000,
      isBillable: true,
    });
    // 500,000 - 200,000 = 300,000
    expect(custodyQtyMilli()).toBe(300_000);
    rows = await jobRepo.getTechnicianCustody(technicianPartyId);
    expect(rows.find((r) => r.itemId === gasItemId)?.qtyHeldMilli).toBe(300_000);

    // Step 3: return 100g unused. job_part return row (entry_type='return',
    // reverses_job_part_id set) + stock_movement (movement_type='job_return',
    // positive, back to Naeem's warehouse). Not a new production write
    // method — PHASE_6.md's own P6-7 spec describes this step at the SQL
    // level, and no repository method for "return parts from a job" is
    // part of this phase's task list.
    rawDb
      .prepare(
        `INSERT INTO job_part (id, tenant_id, job_id, item_id, quantity, unit_cost, unit_price, is_returned, issued_at, business_unit_id, is_billable, entry_type, reverses_job_part_id)
         VALUES (?, ?, ?, ?, 100000, 84000, 100000, 0, ?, ?, 1, 'return', ?)`,
      )
      .run(newId(), TENANT_ID, jobId, gasItemId, now, partsUnitId, jobPart.jobPartId);
    rawDb
      .prepare(
        `INSERT INTO stock_movement (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, unit_cost, source_type, source_id, created_at, business_unit_id)
         VALUES (?, ?, ?, ?, ?, 'job_return', 100000, 84000, 'job_part', ?, ?, ?)`,
      )
      .run(
        newId(),
        TENANT_ID,
        gasItemId,
        technicianWarehouseId,
        now,
        jobPart.jobPartId,
        now,
        partsUnitId,
      );
    // 300,000 + 100,000 = 400,000 (he had 300, got 100 back)
    expect(custodyQtyMilli()).toBe(400_000);
    rows = await jobRepo.getTechnicianCustody(technicianPartyId);
    expect(rows.find((r) => r.itemId === gasItemId)?.qtyHeldMilli).toBe(400_000);

    // Step 4: actual count reveals only 350,000 milli-units (0.35 kg).
    // Shortage = 400,000 - 350,000 = 50,000 milli-units = 0.05 kg.
    // Valued at Rs 840/kg = 84,000 paisa/kg: 0.05 x 84,000 = 4,200 paisa.
    const shortageValuePaisa = 4200;
    const reconciliation = await custodyRepo.recordCustodyReconciliation({
      warehouseId: technicianWarehouseId,
      custodianPartyId: technicianPartyId,
      reconciledOn: '2026-09-05',
      shortageValuePaisa,
      notes: 'Actual count 350g, expected 400g',
    });

    expect(reconciliation.actionTaken).toBe('noted');
    expect(reconciliation.shortageValuePaisa).toBe(4200);

    const reconciliationRows = rawDb
      .prepare(
        `SELECT warehouse_id, custodian_party_id, action_taken, shortage_value, ledger_entry_id FROM custody_reconciliation WHERE warehouse_id = ?`,
      )
      .all(technicianWarehouseId) as Array<Record<string, unknown>>;
    expect(reconciliationRows).toHaveLength(1);
    expect(reconciliationRows[0]?.['action_taken']).toBe('noted');
    expect(reconciliationRows[0]?.['shortage_value']).toBe(4200);
    expect(reconciliationRows[0]?.['ledger_entry_id']).toBeNull();

    // No party_ledger entry from this flow — ever (ADR-0006).
    const ledgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE party_id = ?`)
      .all(technicianPartyId);
    expect(ledgerRows).toHaveLength(0);
  });
});

describe('KyselyCustodyRepository.recordCustodyReconciliation', () => {
  it('inserts audit_log alongside the reconciliation', async () => {
    const result = await custodyRepo.recordCustodyReconciliation({
      warehouseId: technicianWarehouseId,
      custodianPartyId: technicianPartyId,
      reconciledOn: '2026-09-05',
      shortageValuePaisa: 0,
      notes: null,
    });

    const auditRows = rawDb
      .prepare(
        `SELECT * FROM audit_log WHERE table_name = 'custody_reconciliation' AND record_id = ?`,
      )
      .all(result.id);
    expect(auditRows).toHaveLength(1);
  });
});
