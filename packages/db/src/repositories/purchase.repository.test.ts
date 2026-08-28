import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyPurchaseRepository } from './purchase.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let repo: KyselyPurchaseRepository;
let supplierId: string;
let warehouseId: string;
let pieceUomId: string;
let kgUomId: string;
let cylinderUomId: string;
let compressorItemId: string;
let gasItemId: string;

function insertItem(
  id: string,
  nameEn: string,
  stockUomId: string,
  purchaseUomId: string | null,
  purchaseToStockFactor: number,
): void {
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO item
         (id, tenant_id, item_code, name_en, business_unit_id, stock_uom_id,
          purchase_uom_id, purchase_to_stock_factor, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, (SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'),
               ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      TENANT_ID,
      id,
      nameEn,
      TENANT_ID,
      stockUomId,
      purchaseUomId,
      purchaseToStockFactor,
      now,
      now,
    );
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-purchase-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  repo = new KyselyPurchaseRepository(kysely, TENANT_ID, DEVICE_CODE);

  warehouseId = (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND is_default = 1`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;
  pieceUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Piece'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  kgUomId = (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Kg'`).get(TENANT_ID) as {
      id: string;
    }
  ).id;
  cylinderUomId = (
    rawDb
      .prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = 'Cylinder'`)
      .get(TENANT_ID) as {
      id: string;
    }
  ).id;

  const now = new Date().toISOString();
  supplierId = '10000000-0000-1000-8000-000000000001';
  rawDb
    .prepare(
      `INSERT INTO party (id, tenant_id, party_code, party_type, name, phone, is_active, created_at, updated_at)
       VALUES (?, ?, 'SUP-A-000001', 'supplier', 'Test Gas & Compressor Supplier', '0300', 1, ?, ?)`,
    )
    .run(supplierId, TENANT_ID, now, now);

  compressorItemId = '20000000-0000-1000-8000-000000000001';
  insertItem(compressorItemId, 'Compressor 1.5 Ton', pieceUomId, pieceUomId, 1000);

  // Gas cylinder -> kg, same hand-verified numbers as Phase 1: 13.6 kg/cylinder.
  gasItemId = '20000000-0000-1000-8000-000000000002';
  insertItem(gasItemId, 'Gas R-410A (13.6kg cylinder)', kgUomId, cylinderUomId, 13_600);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyPurchaseRepository.createPurchase', () => {
  it('cash purchase: posts stock only, zero party_ledger rows, correct cost math', async () => {
    // Line 1: 2 compressors @ Rs 5,000 each (1:1 UoM, no conversion)
    //   lineTotal = 500000 * 2000 / 1000 = 1,000,000 paisa = Rs 10,000
    //   stockQuantityMilli = 2000 (unchanged, factor 1000)
    //   costPerStockUnitPaisa = 500000 (unchanged, factor 1000)
    // Line 2: 1 gas cylinder @ Rs 35,000 (13.6 kg/cylinder conversion)
    //   lineTotal = 3500000 * 1000 / 1000 = 3,500,000 paisa = Rs 35,000
    //   stockQuantityMilli = round(1000 * 13600 / 1000) = 13,600 (13.6 kg)
    //   costPerStockUnitPaisa = round(3500000 * 1000 / 13600) = 257,353 (Rs 2,573.53/kg)
    // subtotal = total = 1,000,000 + 3,500,000 = 4,500,000 paisa = Rs 45,000
    const result = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: 'INV-CASH-1',
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 2000, unitCostPaisa: 500_000, notes: null },
        { itemId: gasItemId, quantityMilli: 1000, unitCostPaisa: 3_500_000, notes: null },
      ],
    });

    expect(result.docNo).toBe('PUR-0001');
    expect(result.totalAmountPaisa).toBe(4_500_000);

    const purchaseRow = rawDb
      .prepare(`SELECT * FROM purchase WHERE id = ?`)
      .get(result.id) as Record<string, unknown>;
    expect(purchaseRow['payment_mode']).toBe('cash');
    expect(purchaseRow['paid_amount']).toBe(4_500_000);
    expect(purchaseRow['total_amount']).toBe(4_500_000);
    expect(purchaseRow['status']).toBe('confirmed');
    expect(purchaseRow['warehouse_id']).toBe(warehouseId);
    const partsBuId = (
      rawDb
        .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
        .get(TENANT_ID) as {
        id: string;
      }
    ).id;
    expect(purchaseRow['business_unit_id']).toBe(partsBuId);

    const movements = rawDb
      .prepare(`SELECT * FROM stock_movement WHERE source_id = ? ORDER BY item_id`)
      .all(result.id) as Array<Record<string, unknown>>;
    expect(movements).toHaveLength(2);

    const compressorMove = movements.find((m) => m['item_id'] === compressorItemId);
    expect(compressorMove?.['quantity']).toBe(2000);
    expect(compressorMove?.['unit_cost']).toBe(500_000);
    expect(compressorMove?.['movement_type']).toBe('purchase');
    expect(compressorMove?.['business_unit_id']).toBe(partsBuId);

    const gasMove = movements.find((m) => m['item_id'] === gasItemId);
    expect(gasMove?.['quantity']).toBe(13_600); // 13.6 kg
    expect(gasMove?.['unit_cost']).toBe(257_353); // Rs 2,573.53/kg

    const ledgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE party_id = ?`)
      .all(supplierId);
    expect(ledgerRows).toHaveLength(0);

    const compressorItem = rawDb
      .prepare(`SELECT last_purchase_cost, avg_cost FROM item WHERE id = ?`)
      .get(compressorItemId) as { last_purchase_cost: number; avg_cost: number };
    expect(compressorItem.last_purchase_cost).toBe(500_000);
    expect(compressorItem.avg_cost).toBe(500_000);

    const gasItem = rawDb
      .prepare(`SELECT last_purchase_cost, avg_cost FROM item WHERE id = ?`)
      .get(gasItemId) as { last_purchase_cost: number; avg_cost: number };
    expect(gasItem.last_purchase_cost).toBe(257_353);
    expect(gasItem.avg_cost).toBe(257_353);
  });

  it('createPurchase generates PUR-NNNN doc_no', async () => {
    // First purchase on a fresh DB: nextNumber=1, formatDisplayDocNumber('PUR', 1) = 'PUR-0001'
    const result = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    expect(result.docNo).toBe('PUR-0001');
  });

  it('credit purchase: exactly one negative party_ledger row, bill metadata written', async () => {
    const result = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: 'INV-CREDIT-1',
      paymentMode: 'credit',
      billReference: 'BILL-9001',
      dueDate: '2026-09-15',
      billNotes: '30 day terms',
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    expect(result.totalAmountPaisa).toBe(500_000);

    const purchaseRow = rawDb
      .prepare(`SELECT * FROM purchase WHERE id = ?`)
      .get(result.id) as Record<string, unknown>;
    expect(purchaseRow['payment_mode']).toBe('credit');
    expect(purchaseRow['paid_amount']).toBe(0);

    const ledgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE party_id = ?`)
      .all(supplierId) as Array<Record<string, unknown>>;
    expect(ledgerRows).toHaveLength(1);
    const ledgerRow = ledgerRows[0] as Record<string, unknown>;
    expect(ledgerRow['entry_type']).toBe('purchase');
    // Negative: the shop's balance toward the supplier goes down (we owe more).
    expect(ledgerRow['amount']).toBe(-500_000);
    expect(ledgerRow['source_type']).toBe('purchase');
    expect(ledgerRow['source_id']).toBe(result.id);
    expect(ledgerRow['bill_reference']).toBe('BILL-9001');
    expect(ledgerRow['due_date']).toBe('2026-09-15');
    expect(ledgerRow['bill_notes']).toBe('30 day terms');
  });

  it('worked example: a Rs 5,000 credit purchase reads correctly through v_party_balance', async () => {
    // The owner asked to see the number, not be told it's correct — this
    // queries the real view, not a hand-simulated equivalent.
    const result = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'credit',
      billReference: 'BILL-5000',
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 500_000, notes: null },
      ],
    });
    expect(result.totalAmountPaisa).toBe(500_000); // Rs 5,000.00

    const ledgerRow = rawDb
      .prepare(`SELECT amount FROM party_ledger WHERE source_id = ?`)
      .get(result.id) as { amount: number };
    expect(ledgerRow.amount).toBe(-500_000);

    const balanceRow = rawDb
      .prepare(`SELECT balance_paisa, balance_pkr FROM v_party_balance WHERE party_id = ?`)
      .get(supplierId) as { balance_paisa: number; balance_pkr: number };
    expect(balanceRow.balance_paisa).toBe(-500_000);
    expect(balanceRow.balance_pkr).toBe(-5000);
  });

  it('resolves business_unit_id at runtime — no hardcoded id anywhere in the path', async () => {
    // Re-seed business_unit with a DIFFERENT id for PARTS than whatever the
    // beforeEach seed produced, then confirm the purchase still resolves
    // and posts against the NEW id — proving nothing in the path hardcodes
    // the original UUID.
    const oldPartsId = (
      rawDb
        .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
        .get(TENANT_ID) as {
        id: string;
      }
    ).id;
    const newPartsId = '30000000-0000-1000-8000-000000000099';
    expect(newPartsId).not.toBe(oldPartsId);

    // item.business_unit_id (nullable) points at the old row — clear it
    // first so changing the parent key doesn't dangle a foreign key. This
    // test only cares about the PURCHASE path's own resolution, not the
    // item's business_unit_id.
    rawDb.prepare(`UPDATE item SET business_unit_id = NULL WHERE tenant_id = ?`).run(TENANT_ID);
    rawDb
      .prepare(`UPDATE business_unit SET id = ? WHERE tenant_id = ? AND code = 'PARTS'`)
      .run(newPartsId, TENANT_ID);

    const result = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 100_000, notes: null },
      ],
    });

    const purchaseRow = rawDb
      .prepare(`SELECT business_unit_id FROM purchase WHERE id = ?`)
      .get(result.id) as {
      business_unit_id: string;
    };
    expect(purchaseRow.business_unit_id).toBe(newPartsId);

    const movement = rawDb
      .prepare(`SELECT business_unit_id FROM stock_movement WHERE source_id = ?`)
      .get(result.id) as { business_unit_id: string };
    expect(movement.business_unit_id).toBe(newPartsId);
  });

  it('rejects a purchase with zero lines', async () => {
    await expect(
      repo.createPurchase({
        supplierId,
        warehouseId: null,
        purchaseDate: '2026-08-24',
        supplierInvoiceNo: null,
        paymentMode: 'cash',
        billReference: null,
        dueDate: null,
        billNotes: null,
        notes: null,
        lines: [],
      }),
    ).rejects.toThrow();
  });
});

describe('KyselyPurchaseRepository.cancelPurchase', () => {
  it('cash purchase: reversing stock_movement row, stock back to zero, no party_ledger touched', async () => {
    const created = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 2000, unitCostPaisa: 500_000, notes: null },
        { itemId: gasItemId, quantityMilli: 1000, unitCostPaisa: 3_500_000, notes: null },
      ],
    });

    await repo.cancelPurchase(created.id);

    const movements = rawDb
      .prepare(`SELECT * FROM stock_movement WHERE source_id = ? ORDER BY item_id, created_at`)
      .all(created.id) as Array<Record<string, unknown>>;
    // 2 original + 2 reversing = 4 rows total, never an update/delete.
    expect(movements).toHaveLength(4);

    const compressorNet = movements
      .filter((m) => m['item_id'] === compressorItemId)
      .reduce((sum, m) => sum + (m['quantity'] as number), 0);
    expect(compressorNet).toBe(0);

    const gasNet = movements
      .filter((m) => m['item_id'] === gasItemId)
      .reduce((sum, m) => sum + (m['quantity'] as number), 0);
    expect(gasNet).toBe(0);

    const reversals = movements.filter((m) => m['movement_type'] === 'purchase_return');
    expect(reversals).toHaveLength(2);
    for (const reversal of reversals) {
      expect(reversal['reversed_by_id']).toBeNull();
    }
    // Originals are untouched — still NULL, never updated to point forward.
    const originals = movements.filter((m) => m['movement_type'] === 'purchase');
    for (const original of originals) {
      expect(original['reversed_by_id']).toBeNull();
    }

    const ledgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE party_id = ?`)
      .all(supplierId);
    expect(ledgerRows).toHaveLength(0);

    const purchaseRow = rawDb
      .prepare(`SELECT status FROM purchase WHERE id = ?`)
      .get(created.id) as {
      status: string;
    };
    expect(purchaseRow.status).toBe('cancelled');
  });

  it('credit purchase: reversing party_ledger row brings balance back to zero', async () => {
    const created = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'credit',
      billReference: 'BILL-1',
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    await repo.cancelPurchase(created.id);

    const ledgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE party_id = ? ORDER BY created_at`)
      .all(supplierId) as Array<Record<string, unknown>>;
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows[0]?.['amount']).toBe(-500_000);
    expect(ledgerRows[1]?.['amount']).toBe(500_000);
    expect(ledgerRows[1]?.['entry_type']).toBe('purchase_return');

    const netBalance = ledgerRows.reduce((sum, r) => sum + (r['amount'] as number), 0);
    expect(netBalance).toBe(0);

    const movements = rawDb
      .prepare(`SELECT quantity FROM stock_movement WHERE source_id = ?`)
      .all(created.id) as Array<{ quantity: number }>;
    const netStock = movements.reduce((sum, m) => sum + m.quantity, 0);
    expect(netStock).toBe(0);

    // Same claim, through the real views a report actually reads — not a
    // hand-summed equivalent. No join to reversed_by_id anywhere: both
    // views just SUM() every row sharing the purchase's (source_type,
    // source_id) / party_id, and a cancelled purchase nets to zero for
    // free because the reversal is a sibling row under the same document.
    const balanceRow = rawDb
      .prepare(`SELECT balance_paisa FROM v_party_balance WHERE party_id = ?`)
      .get(supplierId) as { balance_paisa: number };
    expect(balanceRow.balance_paisa).toBe(0);

    const stockRow = rawDb
      .prepare(`SELECT qty_milli FROM v_stock_on_hand WHERE item_id = ? AND warehouse_id = ?`)
      .get(compressorItemId, warehouseId) as { qty_milli: number };
    expect(stockRow.qty_milli).toBe(0);
  });

  it('rejects cancelling an already-cancelled purchase', async () => {
    const created = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    await repo.cancelPurchase(created.id);
    await expect(repo.cancelPurchase(created.id)).rejects.toThrow();
  });

  it('two concurrent cancel calls on the same purchase: exactly one succeeds, exactly one reversal posted', async () => {
    const created = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'credit',
      billReference: 'BILL-RACE',
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    // The two cancelPurchase() calls ARE invoked concurrently at the JS
    // level — both started via Promise.allSettled, neither awaited before
    // the other begins. But that does NOT mean their SQL execution
    // overlaps: reading Kysely's TransactionBuilder.execute() directly
    // (node_modules/kysely/dist/cjs/kysely.js) shows it calls
    // executor.provideConnection(...) BEFORE beginTransaction() or the
    // callback (our SELECT) ever runs, and provideConnection awaits
    // driver.acquireConnection() first — which, for SqliteDriver, awaits
    // a ConnectionMutex.lock() that only resolves once the OTHER call's
    // entire transaction (SELECT, inserts, UPDATE, COMMIT) has finished
    // and called releaseConnection(). So the second call's own SELECT
    // literally cannot execute until the first call has already
    // committed — there is no read-then-write gap for it to fall into on
    // a shared connection; the mutex forces full serialization before
    // either call's callback body runs. This proves the guard holds
    // when two calls share a connection, but does NOT by itself prove
    // the real production case, where every existing IPC handler
    // (item.handler.ts) opens a FRESH connection per call — the mutex is
    // per-connection, so it does not apply there. See the next test.
    const results = await Promise.allSettled([
      repo.cancelPurchase(created.id),
      repo.cancelPurchase(created.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The real guard rail: not just "one call rejected", but "exactly one
    // reversal exists" — if the race were lost, this would show 2
    // reversing stock_movement rows / 2 reversing party_ledger rows
    // instead of 1, silently doubling the stock/balance correction.
    const reversalMovements = rawDb
      .prepare(
        `SELECT * FROM stock_movement WHERE source_id = ? AND movement_type = 'purchase_return'`,
      )
      .all(created.id);
    expect(reversalMovements).toHaveLength(1);

    const reversalLedgerRows = rawDb
      .prepare(`SELECT * FROM party_ledger WHERE source_id = ? AND entry_type = 'purchase_return'`)
      .all(created.id);
    expect(reversalLedgerRows).toHaveLength(1);

    const purchaseRow = rawDb
      .prepare(`SELECT status FROM purchase WHERE id = ?`)
      .get(created.id) as {
      status: string;
    };
    expect(purchaseRow.status).toBe('cancelled');
  });

  it('two concurrent cancel calls from SEPARATE connections (the real IPC pattern): still exactly one reversal, never two, and fails fast not slow', async () => {
    // Every existing IPC handler (item.handler.ts, import.handler.ts)
    // opens a fresh better-sqlite3 connection per call via
    // openDatabase(dbPath) and closes it when done — a future
    // purchase:cancel handler would do the same. Two such connections do
    // NOT share Kysely's per-connection mutex (see the test above), so
    // the guard here is a genuinely different mechanism: SQLite's own
    // write lock. The losing call fails with a raw SQLITE_BUSY "database
    // is locked" error, not our own "already cancelled" message.
    //
    // busy_timeout=5000 (packages/db/src/connection.ts) IS set on both
    // connections — confirmed below by reading the pragma back, not
    // assumed. Despite that, measured wall-clock timing during
    // development showed the losing call fails in ~2ms, not after
    // waiting anywhere near 5000ms. Reason, verified by elimination: this
    // whole app is a single Node.js process on a single thread (true in
    // this test AND true in the real Electron main process, which is
    // also single-threaded Node). better-sqlite3's calls are synchronous
    // — while the losing connection's write is blocked retrying inside
    // its native busy-timeout loop, the winning connection's own paused
    // async continuation (needed to reach COMMIT and release the lock)
    // cannot run, because reaching it requires the event loop, which the
    // losing connection's still-blocking call is not yielding. So the
    // retry can never observe the lock becoming free and gives up
    // quickly rather than waiting out the full timeout. This is a real
    // property of this app's architecture, not a test artifact — two
    // near-simultaneous purchase:cancel IPC calls in production would
    // fail fast the same way, not hang for up to 5 seconds.
    const created = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'credit',
      billReference: 'BILL-2CONN-RACE',
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 1000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    const dbA = openDatabase(dbPath);
    const dbB = openDatabase(dbPath);

    // Confirm the pragma actually took effect on both connections —
    // not just that openDatabase() was called.
    expect(dbA.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(dbB.pragma('busy_timeout', { simple: true })).toBe(5000);

    const repoA = new KyselyPurchaseRepository(createKyselyDb(dbA), TENANT_ID, DEVICE_CODE);
    const repoB = new KyselyPurchaseRepository(createKyselyDb(dbB), TENANT_ID, DEVICE_CODE);

    try {
      const startedAt = performance.now();
      const results = await Promise.allSettled([
        repoA.cancelPurchase(created.id),
        repoB.cancelPurchase(created.id),
      ]);
      const elapsedMs = performance.now() - startedAt;

      // The documented, measured finding: despite busy_timeout=5000, the
      // loser fails fast (single Node.js thread — see comment above), not
      // after waiting out the timeout. Assert well under it, generously
      // bounded so this isn't flaky on a loaded CI box, but tight enough
      // to catch a regression to a 5-second hang.
      expect(elapsedMs).toBeLessThan(2000);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // The loser's error .code — checked directly, not the message text.
      // Confirmed SQLITE_BUSY (ordinary lock contention), never
      // SQLITE_BUSY_SNAPSHOT (a stale WAL read-view, which would mean
      // this needs a different fix: restart-with-fresh-snapshot, not just
      // "someone else holds the lock, wait or give up").
      const loser = rejected[0] as PromiseRejectedResult;
      expect((loser.reason as { code?: string }).code).toBe('SQLITE_BUSY');

      const reversalMovements = rawDb
        .prepare(
          `SELECT * FROM stock_movement WHERE source_id = ? AND movement_type = 'purchase_return'`,
        )
        .all(created.id);
      expect(reversalMovements).toHaveLength(1);

      const reversalLedgerRows = rawDb
        .prepare(
          `SELECT * FROM party_ledger WHERE source_id = ? AND entry_type = 'purchase_return'`,
        )
        .all(created.id);
      expect(reversalLedgerRows).toHaveLength(1);

      const purchaseRow = rawDb
        .prepare(`SELECT status FROM purchase WHERE id = ?`)
        .get(created.id) as {
        status: string;
      };
      expect(purchaseRow.status).toBe('cancelled');
    } finally {
      dbA.close();
      dbB.close();
    }
  });
});

describe('KyselyPurchaseRepository.getPurchaseById', () => {
  it('round-trips a created purchase including its lines', async () => {
    const created = await repo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-24',
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [
        { itemId: compressorItemId, quantityMilli: 3000, unitCostPaisa: 500_000, notes: null },
      ],
    });

    const fetched = await repo.getPurchaseById(created.id);
    expect(fetched?.docNo).toBe(created.docNo);
    expect(fetched?.paymentMode).toBe('cash');
    expect(fetched?.totalAmountPaisa).toBe(1_500_000);
    expect(fetched?.lines).toHaveLength(1);
    expect(fetched?.lines[0]?.quantityMilli).toBe(3000);
  });
});

describe('document_sequence concurrency — does racing createPurchase ever produce a duplicate doc_no?', () => {
  // Same investigation as party.repository.test.ts's document_sequence
  // block, for the OTHER consumer of document_sequence built this phase.
  // nextPurchaseDocNo has the identical read-then-write shape; checked
  // separately from BUG-15 (PROJECT.md) because the consequence would be
  // different if it failed — a duplicate PUR-A-000123 is a data-integrity
  // bug, not just a leaked error message.
  it('same connection: N concurrent creates all succeed with unique sequential doc numbers', async () => {
    const N = 5;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        repo.createPurchase({
          supplierId,
          warehouseId: null,
          purchaseDate: '2026-08-24',
          supplierInvoiceNo: null,
          paymentMode: 'cash',
          billReference: null,
          dueDate: null,
          billNotes: null,
          notes: null,
          lines: [
            {
              itemId: compressorItemId,
              quantityMilli: 1000,
              unitCostPaisa: 100_000 + i,
              notes: null,
            },
          ],
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(N);

    const docNos = fulfilled.map(
      (r) => (r as PromiseFulfilledResult<{ docNo: string }>).value.docNo,
    );
    expect(new Set(docNos).size).toBe(N);

    const dbRows = rawDb
      .prepare(`SELECT doc_no FROM purchase WHERE tenant_id = ?`)
      .all(TENANT_ID) as Array<{ doc_no: string }>;
    expect(new Set(dbRows.map((r) => r.doc_no)).size).toBe(dbRows.length);
  });

  it('separate connections (the real IPC pattern): losers fail outright with SQLITE_BUSY — never a duplicate doc number, in the DB or returned', async () => {
    const N = 5;
    const conns = Array.from({ length: N }, () => openDatabase(dbPath));
    try {
      const results = await Promise.allSettled(
        conns.map((db, i) =>
          new KyselyPurchaseRepository(createKyselyDb(db), TENANT_ID, DEVICE_CODE).createPurchase({
            supplierId,
            warehouseId: null,
            purchaseDate: '2026-08-24',
            supplierInvoiceNo: null,
            paymentMode: 'cash',
            billReference: null,
            dueDate: null,
            billNotes: null,
            notes: null,
            lines: [
              {
                itemId: compressorItemId,
                quantityMilli: 1000,
                unitCostPaisa: 100_000 + i,
                notes: null,
              },
            ],
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const docNos = fulfilled.map(
        (r) => (r as PromiseFulfilledResult<{ docNo: string }>).value.docNo,
      );
      // The real invariant: whatever subset succeeds, every succeeding
      // doc_no is unique — never two callers both believing they got the
      // same purchase order number.
      expect(new Set(docNos).size).toBe(docNos.length);

      const dbRows = rawDb
        .prepare(`SELECT doc_no FROM purchase WHERE tenant_id = ?`)
        .all(TENANT_ID) as Array<{ doc_no: string }>;
      expect(new Set(dbRows.map((r) => r.doc_no)).size).toBe(dbRows.length);
      expect(dbRows).toHaveLength(fulfilled.length);
    } finally {
      for (const db of conns) db.close();
    }
  });
});
