import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PurchaseOrderHasGrnsError } from '@shop/core';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyPurchaseOrderRepository } from './purchase-order.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyPurchaseOrderRepository;
let supplierId: string;
let pieceUomId: string;
let compressorItemId: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-po-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyPurchaseOrderRepository(kysely, TENANT_ID, DEVICE_CODE);

  pieceUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;

  const now = new Date().toISOString();
  supplierId = '10000000-0000-1000-8000-000000000001';
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, phone, is_active, created_at, updated_at)
       VALUES (?, ?, 'SUP-A-000001', 'supplier', 'Test Compressor Supplier', '0300', 1, ?, ?)`,
    )
    .run(supplierId, TENANT_ID, now, now);

  compressorItemId = '20000000-0000-1000-8000-000000000001';
  rawDb
    .prepare(
      `INSERT INTO item
         (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id,
          purchase_uom_id, purchase_to_stock_factor, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'Compressor 1.5 Ton', (SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'),
               ?, ?, 1000, 1, ?, ?)`,
    )
    .run(
      compressorItemId,
      TENANT_ID,
      compressorItemId,
      TENANT_ID,
      pieceUomId,
      pieceUomId,
      now,
      now,
    );
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyPurchaseOrderRepository', () => {
  it('create PO with named supplier: doc_no PO-0001, status draft, every column correct', async () => {
    const result = await repo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: '2026-09-20',
      notes: 'Urgent restock',
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 5000, notes: 'Need 5 pieces' }],
    });

    // First PO on a fresh DB: nextNumber=1, formatDisplayDocNumber('PO', 1) = 'PO-0001'
    expect(result.docNo).toBe('PO-0001');

    const poRow = rawDb
      .prepare(`SELECT * FROM purchase_order WHERE id = ?`)
      .get(result.id) as Record<string, unknown>;
    expect(poRow['doc_no']).toBe('PO-0001');
    expect(poRow['supplier_party_id']).toBe(supplierId);
    expect(poRow['supplier_note']).toBeNull();
    expect(poRow['order_date']).toBe('2026-09-12');
    expect(poRow['expected_delivery']).toBe('2026-09-20');
    expect(poRow['notes']).toBe('Urgent restock');
    expect(poRow['status']).toBe('draft');

    const lineRows = rawDb
      .prepare(`SELECT * FROM purchase_order_line WHERE purchase_order_id = ?`)
      .all(result.id) as Array<Record<string, unknown>>;
    expect(lineRows).toHaveLength(1);
    expect(lineRows[0]?.['item_id']).toBe(compressorItemId);
    expect(lineRows[0]?.['quantity_ordered_milli']).toBe(5000);
    expect(lineRows[0]?.['quantity_received_milli']).toBe(0);
    expect(lineRows[0]?.['notes']).toBe('Need 5 pieces');
  });

  it('create PO with no supplier party, only supplier_note: succeeds, supplier_party_id null', async () => {
    const result = await repo.create({
      supplierPartyId: null,
      supplierNote: 'Unregistered roadside vendor, cash only',
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 2000, notes: null }],
    });

    const poRow = rawDb
      .prepare(`SELECT * FROM purchase_order WHERE id = ?`)
      .get(result.id) as Record<string, unknown>;
    expect(poRow['supplier_party_id']).toBeNull();
    expect(poRow['supplier_note']).toBe('Unregistered roadside vendor, cash only');
  });

  it('cancel a draft PO with no GRNs: status becomes cancelled', async () => {
    const result = await repo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 1000, notes: null }],
    });

    await repo.cancel(result.id);

    const poRow = rawDb
      .prepare(`SELECT status FROM purchase_order WHERE id = ?`)
      .get(result.id) as { status: string };
    expect(poRow.status).toBe('cancelled');
  });

  it('cancel a PO that has a confirmed GRN: throws PurchaseOrderHasGrnsError', async () => {
    const result = await repo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 1000, notes: null }],
    });

    const now = new Date().toISOString();
    const grnId = '30000000-0000-1000-8000-000000000001';
    rawDb
      .prepare(
        `INSERT INTO grn (id, tenant_id, doc_no, purchase_order_id, supplier_party_id, grn_date, payment_mode, status, created_at, updated_at)
         VALUES (?, ?, 'GRN-0001', ?, ?, '2026-09-13', 'cash', 'confirmed', ?, ?)`,
      )
      .run(grnId, TENANT_ID, result.id, supplierId, now, now);

    await expect(repo.cancel(result.id)).rejects.toThrow(PurchaseOrderHasGrnsError);

    const poRow = rawDb
      .prepare(`SELECT status FROM purchase_order WHERE id = ?`)
      .get(result.id) as { status: string };
    expect(poRow.status).toBe('draft'); // untouched — cancel must not partially apply
  });

  it('list: newest first, cancelled POs excluded', async () => {
    const first = await repo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-10',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 1000, notes: null }],
    });
    const second = await repo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-11',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 2000, notes: null }],
    });
    const third = await repo.create({
      supplierPartyId: supplierId,
      supplierNote: null,
      orderDate: '2026-09-12',
      expectedDelivery: null,
      notes: null,
      lines: [{ itemId: compressorItemId, quantityOrderedMilli: 3000, notes: null }],
    });
    await repo.cancel(second.id);

    const rows = await repo.list();

    expect(rows.map((r) => r.id)).toEqual([third.id, first.id]);
    expect(rows.find((r) => r.id === second.id)).toBeUndefined();

    const thirdRow = rows.find((r) => r.id === third.id);
    expect(thirdRow?.supplierName).toBe('Test Compressor Supplier');
    expect(thirdRow?.lineCount).toBe(1);
    expect(thirdRow?.totalOrderedMilli).toBe(3000);
    expect(thirdRow?.totalReceivedMilli).toBe(0);
  });
});
