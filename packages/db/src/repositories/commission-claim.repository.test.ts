import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;

let repairUnitId: string;
let customerId: string;
let jobId: string;
let saleId: string;
let saleLineId: string;
let serviceChargeId: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-commission-claim-schema-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const now = new Date().toISOString();

  repairUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'REPAIR'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  const priceLevelId = (
    rawDb
      .prepare(`SELECT id FROM price_level WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;
  const warehouseId = (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;

  customerId = newId();
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_type, party_code, name, customer_type, created_at, updated_at)
       VALUES (?, ?, 'customer', 'CUST-0001', 'Test Customer', 'retail', ?, ?)`,
    )
    .run(customerId, TENANT_ID, now, now);

  jobId = newId();
  rawDb
    .prepare(
      `INSERT INTO job (id, tenant_id, doc_no, customer_id, job_type, received_date, status, labour_charge, parts_cost, total_charge, warranty_days, is_warranty_rework, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_shop', '2026-09-24', 'received', 0, 0, 0, 0, 0, ?, ?)`,
    )
    .run(jobId, TENANT_ID, `JOB-${jobId}`, customerId, now, now);

  serviceChargeId = newId();
  rawDb
    .prepare(
      `INSERT INTO service_charge (id, tenant_id, business_unit_id, name, retail_charge, commission_amount, is_active, created_at)
       VALUES (?, ?, ?, 'AC Installation (schema test)', 300000, 50000, 1, ?)`,
    )
    .run(serviceChargeId, TENANT_ID, repairUnitId, now);

  saleId = newId();
  rawDb
    .prepare(
      `INSERT INTO sale (id, tenant_id, doc_no, customer_id, warehouse_id, price_level_id, sale_date, sale_type, subtotal, discount_amount, tax_amount, total_amount, paid_amount, payment_mode, status, job_id, created_at, updated_at)
       VALUES (?, ?, 'INV-TEST', ?, ?, ?, '2026-09-24', 'job', 300000, 0, 0, 300000, 0, 'credit', 'confirmed', ?, ?, ?)`,
    )
    .run(saleId, TENANT_ID, customerId, warehouseId, priceLevelId, jobId, now, now);

  saleLineId = newId();
  rawDb
    .prepare(
      `INSERT INTO sale_line (id, tenant_id, sale_id, line_no, description, quantity, unit_price, unit_cost, line_total, line_kind, service_charge_id, revenue_type)
       VALUES (?, ?, ?, 1, 'AC Installation (schema test)', 1000, 300000, 0, 300000, 'labour', ?, 'customer_paid')`,
    )
    .run(saleLineId, TENANT_ID, saleId, serviceChargeId);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

function insertClaim(overrideSaleLineId?: string): string {
  const id = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO commission_claim (id, tenant_id, job_id, sale_line_id, service_charge_id, labour_amount_paisa, suggested_amount_paisa, suggested_recipient_party_id, created_at)
       VALUES (?, ?, ?, ?, ?, 300000, 50000, NULL, ?)`,
    )
    .run(id, TENANT_ID, jobId, overrideSaleLineId ?? saleLineId, serviceChargeId, now);
  return id;
}

function insertDecision(claimId: string, attemptNo: number): string {
  const id = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO commission_decision (id, tenant_id, claim_id, attempt_no, decision, reason, decided_at, created_at)
       VALUES (?, ?, ?, ?, 'approved', NULL, ?, ?)`,
    )
    .run(id, TENANT_ID, claimId, attemptNo, now, now);
  return id;
}

describe('commission_claim/commission_decision/commission_decision_recipient/commission_decision_reversal — schema constraints (P16-3a checkpoint 1)', () => {
  it('UNIQUE(sale_line_id): a second claim against the same sale_line fails', () => {
    insertClaim();
    expect(() => insertClaim()).toThrow(/UNIQUE constraint failed/);
  });

  it('a claim against a different sale_line succeeds (sanity check the UNIQUE is scoped to sale_line_id, not global)', () => {
    insertClaim();
    const otherSaleLineId = newId();
    rawDb
      .prepare(
        `INSERT INTO sale_line (id, tenant_id, sale_id, line_no, description, quantity, unit_price, unit_cost, line_total, line_kind, service_charge_id, revenue_type)
         VALUES (?, ?, ?, 2, 'Second labour line', 1000, 100000, 0, 100000, 'labour', ?, 'customer_paid')`,
      )
      .run(otherSaleLineId, TENANT_ID, saleId, serviceChargeId);
    expect(() => insertClaim(otherSaleLineId)).not.toThrow();
  });

  it('UNIQUE(claim_id, attempt_no): a second decision with the same attempt_no on the same claim fails', () => {
    const claimId = insertClaim();
    insertDecision(claimId, 1);
    expect(() => insertDecision(claimId, 1)).toThrow(/UNIQUE constraint failed/);
  });

  it('a second decision on the same claim with a DIFFERENT attempt_no succeeds (the attempt-2 re-approval path)', () => {
    const claimId = insertClaim();
    insertDecision(claimId, 1);
    expect(() => insertDecision(claimId, 2)).not.toThrow();
  });

  it('UNIQUE(decision_id): a second reversal of the same decision fails', () => {
    const claimId = insertClaim();
    const decisionId = insertDecision(claimId, 1);
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO commission_decision_reversal (id, tenant_id, decision_id, reason, reversed_at, created_at)
         VALUES (?, ?, ?, 'Wrong amount', ?, ?)`,
      )
      .run(newId(), TENANT_ID, decisionId, now, now);

    expect(() =>
      rawDb
        .prepare(
          `INSERT INTO commission_decision_reversal (id, tenant_id, decision_id, reason, reversed_at, created_at)
           VALUES (?, ?, ?, 'Second attempt', ?, ?)`,
        )
        .run(newId(), TENANT_ID, decisionId, now, now),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('UNIQUE(decision_id, technician_party_id): the same technician cannot appear twice as a recipient on one decision', () => {
    const claimId = insertClaim();
    const decisionId = insertDecision(claimId, 1);
    const technicianId = newId();
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_type, party_code, name, staff_role, wage_type, created_at, updated_at)
         VALUES (?, ?, 'staff', 'STF-0001', 'Naeem', 'technician', 'daily', ?, ?)`,
      )
      .run(technicianId, TENANT_ID, new Date().toISOString(), new Date().toISOString());

    rawDb
      .prepare(
        `INSERT INTO commission_decision_recipient (id, tenant_id, decision_id, technician_party_id, amount_paisa)
         VALUES (?, ?, ?, ?, 30000)`,
      )
      .run(newId(), TENANT_ID, decisionId, technicianId);

    expect(() =>
      rawDb
        .prepare(
          `INSERT INTO commission_decision_recipient (id, tenant_id, decision_id, technician_party_id, amount_paisa)
           VALUES (?, ?, ?, ?, 20000)`,
        )
        .run(newId(), TENANT_ID, decisionId, technicianId),
    ).toThrow(/UNIQUE constraint failed/);
  });
});
