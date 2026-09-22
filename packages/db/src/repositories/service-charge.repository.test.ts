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
import { listServiceCharges } from './lookup.repository.js';
import { KyselyServiceChargeRepository } from './service-charge.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let repo: KyselyServiceChargeRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-service-charge-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  repo = new KyselyServiceChargeRepository(kysely, TENANT_ID);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyServiceChargeRepository — P16-1', () => {
  it('creates a fixed-commission charge and reads it back exactly (§4 P16-1 hand-calc)', async () => {
    const record = await repo.createServiceCharge({
      name: 'AC Installation (test)',
      jobType: null,
      retailChargePaisa: 300000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: 50000,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });
    expect(record.name).toBe('AC Installation (test)');
    expect(record.retailChargePaisa).toBe(300000);
    expect(record.commissionMode).toBe('fixed');
    expect(record.commissionAmountPaisa).toBe(50000);
    expect(record.commissionBp).toBeNull();
    expect(record.isActive).toBe(true);

    const all = await repo.listServiceChargesAdmin();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(record.id);
  });

  it('derives commissionMode "bp" from commission_bp set, "none" from both null', async () => {
    const bpCharge = await repo.createServiceCharge({
      name: 'Compressor Replacement Labour',
      jobType: null,
      retailChargePaisa: 400000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: 1000,
      typicalMinutes: null,
      notes: null,
    });
    expect(bpCharge.commissionMode).toBe('bp');

    const noneCharge = await repo.createServiceCharge({
      name: 'Checking Fee',
      jobType: null,
      retailChargePaisa: 30000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });
    expect(noneCharge.commissionMode).toBe('none');
  });

  it('rejects a case-insensitive duplicate name, including against an inactive charge', async () => {
    const first = await repo.createServiceCharge({
      name: 'Gas Refill',
      jobType: null,
      retailChargePaisa: 250000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });
    await repo.toggleServiceCharge(first.id, false);

    await expect(
      repo.createServiceCharge({
        name: 'gas refill',
        jobType: null,
        retailChargePaisa: 100,
        wholesaleChargePaisa: null,
        commissionAmountPaisa: null,
        commissionBp: null,
        typicalMinutes: null,
        notes: null,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("toggle active/inactive: inactive charges are excluded from lookup.repository.ts's listServiceCharges (delivery dropdown), but stay in the admin list", async () => {
    const charge = await repo.createServiceCharge({
      name: 'AC General Service',
      jobType: null,
      retailChargePaisa: 80000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });

    let dropdown = await listServiceCharges(kysely, TENANT_ID);
    expect(dropdown.some((c) => c.id === charge.id)).toBe(true);

    const toggled = await repo.toggleServiceCharge(charge.id, false);
    expect(toggled.isActive).toBe(false);

    dropdown = await listServiceCharges(kysely, TENANT_ID);
    expect(dropdown.some((c) => c.id === charge.id)).toBe(false);

    const admin = await repo.listServiceChargesAdmin();
    expect(admin.some((c) => c.id === charge.id)).toBe(true);
  });

  it("editing a service charge's retail price after a delivery already used it never changes that delivery's sale_line (SQ-6 snapshot)", async () => {
    const charge = await repo.createServiceCharge({
      name: 'Fridge Gas Charging',
      jobType: null,
      retailChargePaisa: 220000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });

    // Simulate a delivered labour line the way job-delivery.repository.ts
    // writes one — description/unitPrice frozen at delivery time, plus a
    // live serviceChargeId FK (migration 0011) for traceability only.
    const saleId = newId();
    const now = new Date().toISOString();
    rawDb
      .prepare(
        `INSERT INTO sale (id, tenant_id, doc_no, warehouse_id, price_level_id, sale_date, sale_type, subtotal, discount_amount, tax_amount, total_amount, paid_amount, payment_mode, status, created_at, updated_at)
         VALUES (?, ?, 'INV-TEST', (SELECT id FROM warehouse WHERE tenant_id = ? LIMIT 1), (SELECT id FROM price_level WHERE tenant_id = ? AND is_default = 1), '2026-09-23', 'job', 220000, 0, 0, 220000, 0, 'credit', 'confirmed', ?, ?)`,
      )
      .run(saleId, TENANT_ID, TENANT_ID, TENANT_ID, now, now);
    const saleLineId = newId();
    rawDb
      .prepare(
        `INSERT INTO sale_line (id, tenant_id, sale_id, line_no, description, quantity, unit_price, unit_cost, line_total, line_kind, service_charge_id, revenue_type)
         VALUES (?, ?, ?, 1, 'Fridge Gas Charging', 1000, 220000, 0, 220000, 'labour', ?, 'customer_paid')`,
      )
      .run(saleLineId, TENANT_ID, saleId, charge.id);

    await repo.updateServiceCharge({
      id: charge.id,
      name: charge.name,
      jobType: null,
      retailChargePaisa: 999900,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });

    const saleLine = rawDb
      .prepare(`SELECT description, unit_price AS unitPrice FROM sale_line WHERE id = ?`)
      .get(saleLineId) as { description: string; unitPrice: number };
    expect(saleLine.description).toBe('Fridge Gas Charging');
    expect(saleLine.unitPrice).toBe(220000);

    const updatedCharge = await repo.listServiceChargesAdmin();
    expect(updatedCharge.find((c) => c.id === charge.id)?.retailChargePaisa).toBe(999900);
  });

  it('update rejects a case-insensitive duplicate against a different charge', async () => {
    const a = await repo.createServiceCharge({
      name: 'Oven Repair',
      jobType: null,
      retailChargePaisa: 100000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });
    const b = await repo.createServiceCharge({
      name: 'Microwave Repair',
      jobType: null,
      retailChargePaisa: 100000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });

    await expect(
      repo.updateServiceCharge({
        id: b.id,
        name: 'oven repair',
        jobType: null,
        retailChargePaisa: 100000,
        wholesaleChargePaisa: null,
        commissionAmountPaisa: null,
        commissionBp: null,
        typicalMinutes: null,
        notes: null,
      }),
    ).rejects.toThrow(/already exists/);

    // Renaming a charge to its own current name (case-different) must NOT be rejected.
    const selfRename = await repo.updateServiceCharge({
      id: a.id,
      name: 'OVEN REPAIR',
      jobType: null,
      retailChargePaisa: 100000,
      wholesaleChargePaisa: null,
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      notes: null,
    });
    expect(selfRename.name).toBe('OVEN REPAIR');
  });
});
