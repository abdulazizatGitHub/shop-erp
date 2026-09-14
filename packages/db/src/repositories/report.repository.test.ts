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
import { KyselyExpenseRepository } from './expense.repository.js';
import { KyselyItemRepository } from './item.repository.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyPurchaseRepository } from './purchase.repository.js';
import { KyselySaleRepository } from './sale.repository.js';
import {
  getCashBookReport,
  getDailySalesReport,
  getExpenseSummaryReport,
  getItemSoldSummaryReport,
  getPeriodComparisonReport,
  getReceivablesAgingReport,
  getStockPerformanceReport,
  getStockValuationReport,
  getUnitPlReport,
} from './report.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let itemRepo: KyselyItemRepository;
let saleRepo: KyselySaleRepository;
let purchaseRepo: KyselyPurchaseRepository;
let partyRepo: KyselyPartyRepository;
let expenseRepo: KyselyExpenseRepository;
let businessUnitId: string;
let repairBusinessUnitId: string;
let sharedBusinessUnitId: string;
let warehouseId: string;

function insertExpenseCategory(name: string, isOwnerDrawing = false): string {
  const id = newId();
  rawDb
    .prepare(
      `INSERT INTO expense_category (id, tenant_id, name, kind, is_billable, is_owner_drawing, sort_order)
       VALUES (?, ?, ?, 'variable', 0, ?, 0)`,
    )
    .run(id, TENANT_ID, name, isOwnerDrawing ? 1 : 0);
  return id;
}

function uomId(name: string): string {
  return (
    rawDb.prepare(`SELECT id FROM uom WHERE tenant_id = ? AND name = ?`).get(TENANT_ID, name) as {
      id: string;
    }
  ).id;
}

function setLastPurchaseCost(itemId: string, costPaisa: number): void {
  rawDb
    .prepare(`UPDATE item SET last_purchase_cost = ?, avg_cost = ? WHERE id = ?`)
    .run(costPaisa, costPaisa, itemId);
}

function insertLedgerEntry(partyId: string, entryDate: string, amountPaisa: number): void {
  rawDb
    .prepare(
      `INSERT INTO party_ledger (id, tenant_id, party_id, entry_date, entry_type, amount, source_type, source_id, created_at)
       VALUES (?, ?, ?, ?, 'sale', ?, 'sale', ?, ?)`,
    )
    .run(newId(), TENANT_ID, partyId, entryDate, amountPaisa, newId(), new Date().toISOString());
}

function insertStockMovement(itemId: string, quantityMilli: number): void {
  rawDb
    .prepare(
      `INSERT INTO stock_movement
         (id, tenant_id, item_id, warehouse_id, movement_date, movement_type, quantity, created_at)
       VALUES (?, ?, ?, ?, ?, 'opening', ?, ?)`,
    )
    .run(
      newId(),
      TENANT_ID,
      itemId,
      warehouseId,
      '2026-08-01',
      quantityMilli,
      new Date().toISOString(),
    );
}

// P11-4b — saleRepo.createSale never produces a labour line itself (only
// job.repository.ts's deliverJob does, via service_charge_id) — a direct
// insert is the only way to seed one for a test.
function insertLabourLine(
  saleId: string,
  lineNo: number,
  quantityMilli: number,
  unitPricePaisa: number,
  lineTotalPaisa: number,
): void {
  rawDb
    .prepare(
      `INSERT INTO sale_line (id, tenant_id, sale_id, line_no, item_id, quantity, unit_price, line_total, line_kind)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'labour')`,
    )
    .run(newId(), TENANT_ID, saleId, lineNo, quantityMilli, unitPricePaisa, lineTotalPaisa);
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-report-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);
  kysely = createKyselyDb(rawDb);
  itemRepo = new KyselyItemRepository(kysely, TENANT_ID, DEVICE_CODE);
  saleRepo = new KyselySaleRepository(kysely, TENANT_ID, DEVICE_CODE);
  purchaseRepo = new KyselyPurchaseRepository(kysely, TENANT_ID, DEVICE_CODE);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
  expenseRepo = new KyselyExpenseRepository(kysely, TENANT_ID, DEVICE_CODE);

  businessUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'PARTS'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  repairBusinessUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'REPAIR'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  sharedBusinessUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'SHARED'`)
      .get(TENANT_ID) as { id: string }
  ).id;
  warehouseId = (
    rawDb
      .prepare(`SELECT id FROM warehouse WHERE tenant_id = ? AND name = 'Shop'`)
      .get(TENANT_ID) as { id: string }
  ).id;
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('R2 — getStockValuationReport', () => {
  it('computes valuation = (quantity on hand / 1000) x last purchase cost, per item, and a grand total', async () => {
    // --- Seed: 2 items with known stock and known last-purchase-cost ---
    // Item A: 50 Kg on hand, Rs 250.00/Kg (25,000 paisa)
    //   valuation = 50,000 milli-Kg x 25,000 paisa / 1000 = 1,250,000 paisa (Rs 12,500.00)
    // Item B: 10 Piece on hand, Rs 1,500.00/Piece (150,000 paisa)
    //   valuation = 10,000 milli-Piece x 150,000 paisa / 1000 = 1,500,000 paisa (Rs 15,000.00)
    // Total valuation = 1,250,000 + 1,500,000 = 2,750,000 paisa (Rs 27,500.00)
    const itemA = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Compressor 1.5 Ton',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Kg'),
      trackStock: true,
      retailPricePaisa: 300000,
    });
    setLastPurchaseCost(itemA.id, 25000);
    insertStockMovement(itemA.id, 50000);

    const itemB = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Gas Cylinder R-410A',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 1800000,
    });
    setLastPurchaseCost(itemB.id, 150000);
    insertStockMovement(itemB.id, 10000);

    // --- Act ---
    const report = await getStockValuationReport(kysely, TENANT_ID);

    // --- Assert: labels (CF-3) ---
    expect(report.costColumnLabel).toBe('Last Purchase Cost');
    expect(report.valuationColumnLabel).toBe('Valuation (Last Purchase Cost)');

    // --- Assert: per-item lines match the hand calculation above ---
    const lineA = report.lines.find((l) => l.itemId === itemA.id);
    expect(lineA).toBeDefined();
    expect(lineA?.itemName).toBe('Compressor 1.5 Ton');
    expect(lineA?.stockUomName).toBe('Kg');
    expect(lineA?.quantityOnHandMilli).toBe(50000);
    expect(lineA?.lastPurchaseCostPaisa).toBe(25000);
    expect(lineA?.valuationPaisa).toBe(1250000);

    const lineB = report.lines.find((l) => l.itemId === itemB.id);
    expect(lineB).toBeDefined();
    expect(lineB?.itemName).toBe('Gas Cylinder R-410A');
    expect(lineB?.stockUomName).toBe('Piece');
    expect(lineB?.quantityOnHandMilli).toBe(10000);
    expect(lineB?.lastPurchaseCostPaisa).toBe(150000);
    expect(lineB?.valuationPaisa).toBe(1500000);

    // --- Assert: grand total ---
    expect(report.totalValuationPaisa).toBe(2750000);
  });

  it('shows zero valuation for an item with no last purchase cost yet (never purchased)', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Never Purchased Widget',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(item.id, 5000); // 5 pieces on hand, but no cost ever recorded

    const report = await getStockValuationReport(kysely, TENANT_ID);

    const line = report.lines.find((l) => l.itemId === item.id);
    expect(line).toBeDefined();
    expect(line?.quantityOnHandMilli).toBe(5000);
    expect(line?.lastPurchaseCostPaisa).toBe(0);
    expect(line?.valuationPaisa).toBe(0);
  });
});

describe('R1 — getDailySalesReport', () => {
  it('aggregates invoice count, total sales, cash collected, and credit given for a single date', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Refrigerant R-32 1kg',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 1500000, // Rs 15,000 / piece
    });
    setLastPurchaseCost(item.id, 900000);
    insertStockMovement(item.id, 20000); // 20 pieces on hand

    const SALE_DATE = '2026-08-15';

    // Sale 1 — cash, 2 pieces: 1,500,000 x 2000 / 1000 = 3,000,000 paisa, paid in full
    const sale1 = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: SALE_DATE,
      paymentMode: 'cash',
      paidAmountPaisa: 3000000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 2000, unitPricePaisa: null }],
    });

    // Sale 2 — cash, 1 piece: 1,500,000 x 1000 / 1000 = 1,500,000 paisa, paid in full
    const sale2 = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: SALE_DATE,
      paymentMode: 'cash',
      paidAmountPaisa: 1500000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: null }],
    });

    // Sale 3 — credit, 3 pieces: 1,500,000 x 3000 / 1000 = 4,500,000 paisa, nothing paid
    const sale3 = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: SALE_DATE,
      paymentMode: 'credit',
      paidAmountPaisa: 0,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 3000, unitPricePaisa: null }],
    });

    expect(sale1.totalAmountPaisa).toBe(3000000);
    expect(sale2.totalAmountPaisa).toBe(1500000);
    expect(sale3.totalAmountPaisa).toBe(4500000);

    // Hand calculation:
    // invoice_count       = 3
    // total_sales_paisa   = 3,000,000 + 1,500,000 + 4,500,000 = 9,000,000
    // cash_collected_paisa= 3,000,000 + 1,500,000 + 0         = 4,500,000
    // credit_given_paisa  = 0         + 0         + 4,500,000 = 4,500,000
    const rows = await getDailySalesReport(kysely, TENANT_ID, SALE_DATE, SALE_DATE);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.date).toBe(SALE_DATE);
    expect(row?.invoiceCount).toBe(3);
    expect(row?.totalSalesPaisa).toBe(9000000);
    expect(row?.cashCollectedPaisa).toBe(4500000);
    expect(row?.creditGivenPaisa).toBe(4500000);
  });

  it('returns no rows for a date range with no confirmed sales', async () => {
    const rows = await getDailySalesReport(kysely, TENANT_ID, '2026-01-01', '2026-01-31');
    expect(rows).toHaveLength(0);
  });

  // P10-2a: report:dailySales now accepts { from, to } instead of a single
  // date — these three prove the range behavior the new contract input
  // relies on (the repository function itself is unchanged; the handler
  // now passes input.from/input.to instead of input.date twice).
  it('P10-2a: from === to reproduces the old single-date behavior — one sale of Rs 6,000', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Single Day Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 600000,
    });
    insertStockMovement(item.id, 5000);

    // 1 sale x Rs 6,000 = 600,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-29',
      paymentMode: 'cash',
      paidAmountPaisa: 600000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: null }],
    });

    const rows = await getDailySalesReport(kysely, TENANT_ID, '2026-08-29', '2026-08-29');
    expect(rows).toHaveLength(1);
    // 1 sale x Rs 6,000 = 600,000 paisa
    expect(rows[0]?.totalSalesPaisa).toBe(600000);
  });

  it('P10-2a: a date range returns one row per date, each with its own total, summing correctly', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Range Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 150000,
    });
    insertStockMovement(item.id, 10000);

    // Aug 29: 1 sale x Rs 6,000 = 600,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-29',
      paymentMode: 'cash',
      paidAmountPaisa: 600000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 4000, unitPricePaisa: 150000 }],
    });
    // Aug 30 (middle of the range): 1 sale x Rs 3,000 = 300,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-30',
      paymentMode: 'cash',
      paidAmountPaisa: 300000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 2000, unitPricePaisa: 150000 }],
    });
    // Aug 31: 1 sale x Rs 1,500 = 150,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-31',
      paymentMode: 'cash',
      paidAmountPaisa: 150000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 150000 }],
    });

    const rows = await getDailySalesReport(kysely, TENANT_ID, '2026-08-29', '2026-08-31');

    // Three separate rows, one per date — not a single aggregate row.
    expect(rows).toHaveLength(3);
    const aug29 = rows.find((r) => r.date === '2026-08-29');
    const aug30 = rows.find((r) => r.date === '2026-08-30');
    const aug31 = rows.find((r) => r.date === '2026-08-31');
    // Aug 29: 600,000 paisa
    expect(aug29?.totalSalesPaisa).toBe(600000);
    // Aug 30: 300,000 paisa
    expect(aug30?.totalSalesPaisa).toBe(300000);
    // Aug 31: 150,000 paisa
    expect(aug31?.totalSalesPaisa).toBe(150000);

    // sum: 600,000 + 300,000 + 150,000 = 1,050,000 paisa
    const sum = rows.reduce((acc, r) => acc + r.totalSalesPaisa, 0);
    expect(sum).toBe(1050000);
  });

  it('P10-2a: a sale outside the queried range is excluded entirely', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Exclusion Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 200000,
    });
    insertStockMovement(item.id, 5000);

    // Outside the queried range — Rs 2,000 on 2026-09-01
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-01',
      paymentMode: 'cash',
      paidAmountPaisa: 200000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 200000 }],
    });

    const rows = await getDailySalesReport(kysely, TENANT_ID, '2026-08-29', '2026-08-31');

    expect(rows).toHaveLength(0);
    expect(rows.find((r) => r.date === '2026-09-01')).toBeUndefined();
  });
});

describe('P11-4a — getPeriodComparisonReport', () => {
  it('returns current and previous period rows separately, summed correctly', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Comparison Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(item.id, 10000);

    // Current period (Sep 1-7):
    // Sale A — Sep 1, cash, Rs 3,000 = 300,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-01',
      paymentMode: 'cash',
      paidAmountPaisa: 300000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 3000, unitPricePaisa: 100000 }],
    });
    // Sale B — Sep 3, credit, Rs 2,000 = 200,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-03',
      paymentMode: 'credit',
      paidAmountPaisa: 0,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 2000, unitPricePaisa: 100000 }],
    });

    // Previous period (Aug 25-31):
    // Sale C — Aug 28, cash, Rs 1,500 = 150,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-28',
      paymentMode: 'cash',
      paidAmountPaisa: 150000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1500, unitPricePaisa: 100000 }],
    });

    const report = await getPeriodComparisonReport(
      kysely,
      TENANT_ID,
      { from: '2026-09-01', to: '2026-09-07' },
      { from: '2026-08-25', to: '2026-08-31' },
    );

    // Sep 1 and Sep 3 are different dates -> 2 separate current-period rows.
    expect(report.current).toHaveLength(2);
    // 300,000 + 200,000 = 500,000 paisa
    const currentTotal = report.current.reduce((sum, b) => sum + b.totalPaisa, 0);
    expect(currentTotal).toBe(500000);

    expect(report.previous).toHaveLength(1);
    // Rs 1,500 = 150,000 paisa
    expect(report.previous[0]?.totalPaisa).toBe(150000);
  });

  it('an empty period returns an empty array, not null and not an error', async () => {
    const report = await getPeriodComparisonReport(
      kysely,
      TENANT_ID,
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2025-12-01', to: '2025-12-31' },
    );

    expect(report.current).toEqual([]);
    expect(report.previous).toEqual([]);
  });

  it('splits cashPaisa/creditPaisa correctly for a single cash sale', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Cash Split Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 400000,
    });
    insertStockMovement(item.id, 5000);

    // Cash sale, Rs 4,000 -> 400,000 paisa, fully paid
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-05',
      paymentMode: 'cash',
      paidAmountPaisa: 400000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 4000, unitPricePaisa: 100000 }],
    });

    const report = await getPeriodComparisonReport(
      kysely,
      TENANT_ID,
      { from: '2026-09-05', to: '2026-09-05' },
      { from: '2026-08-05', to: '2026-08-05' },
    );

    expect(report.current).toHaveLength(1);
    // Rs 4,000 x 100 = 400,000 paisa, fully cash
    expect(report.current[0]?.cashPaisa).toBe(400000);
    expect(report.current[0]?.creditPaisa).toBe(0);
  });
});

describe('P11-4b — getItemSoldSummaryReport', () => {
  it('sums quantity and revenue per item, sorted by revenuePaisa DESC', async () => {
    const itemA = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Item A',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 50000,
    });
    insertStockMovement(itemA.id, 10000);
    const itemB = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Item B',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 80000,
    });
    insertStockMovement(itemB.id, 10000);

    // Item A: 2 pieces x Rs 500 = 50,000 x 2000/1000 = 100,000 paisa, totalSoldMilli = 2,000
    // Item B: 1 piece x Rs 800 = 80,000 paisa, totalSoldMilli = 1,000
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-01',
      paymentMode: 'cash',
      paidAmountPaisa: 180000,
      notes: null,
      lines: [
        { itemId: itemA.id, quantityMilli: 2000, unitPricePaisa: 50000 },
        { itemId: itemB.id, quantityMilli: 1000, unitPricePaisa: 80000 },
      ],
    });

    const rows = await getItemSoldSummaryReport(kysely, TENANT_ID, '2026-09-01', '2026-09-01');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.itemId).toBe(itemA.id);
    expect(rows[0]?.totalSoldMilli).toBe(2000);
    expect(rows[0]?.revenuePaisa).toBe(100000);
    expect(rows[1]?.itemId).toBe(itemB.id);
    expect(rows[1]?.totalSoldMilli).toBe(1000);
    expect(rows[1]?.revenuePaisa).toBe(80000);
  });

  it('a labour line (item_id = null) does not appear and has zero effect on any other item’s numbers', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Item C',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 60000,
    });
    insertStockMovement(item.id, 5000);

    // Item C: 1 piece x Rs 600 = 60,000 paisa, totalSoldMilli = 1,000
    const sale = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-02',
      paymentMode: 'cash',
      paidAmountPaisa: 60000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 60000 }],
    });

    const before = await getItemSoldSummaryReport(kysely, TENANT_ID, '2026-09-02', '2026-09-02');
    expect(before).toHaveLength(1);
    expect(before[0]?.totalSoldMilli).toBe(1000);
    expect(before[0]?.revenuePaisa).toBe(60000);

    // A labour line on the same sale, Rs 2,000 (200,000 paisa) — must not
    // appear as a row, and must not change item C's own totals above.
    insertLabourLine(sale.id, 99, 1000, 200000, 200000);

    const after = await getItemSoldSummaryReport(kysely, TENANT_ID, '2026-09-02', '2026-09-02');

    expect(after).toHaveLength(1);
    expect(after[0]?.itemId).toBe(item.id);
    // Identical to `before` — the labour line contributed nothing to any row.
    expect(after).toEqual(before);
  });

  it('a sale outside the date range does not contribute', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Out Of Range Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(item.id, 5000);

    // Outside the queried range
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-10',
      paymentMode: 'cash',
      paidAmountPaisa: 100000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 100000 }],
    });

    const rows = await getItemSoldSummaryReport(kysely, TENANT_ID, '2026-09-01', '2026-09-07');

    expect(rows).toHaveLength(0);
  });

  it('an item sold in two separate sales in range is summed into one row, not doubled', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Repeat Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(item.id, 10000);

    // Sale 1: 1 piece x Rs 1,000 = 100,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-01',
      paymentMode: 'cash',
      paidAmountPaisa: 100000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 100000 }],
    });
    // Sale 2: 1 piece x Rs 1,000 = 100,000 paisa
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-09-03',
      paymentMode: 'cash',
      paidAmountPaisa: 100000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 100000 }],
    });

    const rows = await getItemSoldSummaryReport(kysely, TENANT_ID, '2026-09-01', '2026-09-07');

    // One row, not two — quantities and revenue summed across both sales.
    expect(rows).toHaveLength(1);
    // 1,000 + 1,000 = 2,000 milli
    expect(rows[0]?.totalSoldMilli).toBe(2000);
    // 100,000 + 100,000 = 200,000 paisa
    expect(rows[0]?.revenuePaisa).toBe(200000);
  });
});

describe('R4 — getCashBookReport', () => {
  it('unions cash purchases (out) and cash sales (in), running balance accumulates in date order', async () => {
    const now = new Date().toISOString();
    const supplierId = newId();
    rawDb
      .prepare(
        `INSERT INTO party (id, tenant_id, party_code, party_type, name, phone, is_active, created_at, updated_at)
         VALUES (?, ?, 'SUP-0001', 'supplier', 'Test Supplier', NULL, 1, ?, ?)`,
      )
      .run(supplierId, TENANT_ID, now, now);

    const purchaseItem = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Purchase Test Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 1,
    });
    const saleItem = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Sale Test Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000, // Rs 1,000 / piece
    });
    setLastPurchaseCost(saleItem.id, 50000);
    insertStockMovement(saleItem.id, 50000); // 50 pieces on hand, enough for both sales

    // Cash purchase 1 — 2026-08-10 — total = Rs 5,000 (500,000 paisa) OUT
    await purchaseRepo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-10',
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [{ itemId: purchaseItem.id, quantityMilli: 1000, unitCostPaisa: 500000, notes: null }],
    });

    // Cash sale 1 — 2026-08-11 — 3 pieces x Rs 1,000 = Rs 3,000 (300,000 paisa) IN
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-11',
      paymentMode: 'cash',
      paidAmountPaisa: 300000,
      notes: null,
      lines: [{ itemId: saleItem.id, quantityMilli: 3000, unitPricePaisa: null }],
    });

    // Cash purchase 2 — 2026-08-12 — total = Rs 2,000 (200,000 paisa) OUT
    await purchaseRepo.createPurchase({
      supplierId,
      warehouseId: null,
      purchaseDate: '2026-08-12',
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: [{ itemId: purchaseItem.id, quantityMilli: 1000, unitCostPaisa: 200000, notes: null }],
    });

    // Cash sale 2 — 2026-08-13 — 8 pieces x Rs 1,000 = Rs 8,000 (800,000 paisa) IN
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-13',
      paymentMode: 'cash',
      paidAmountPaisa: 800000,
      notes: null,
      lines: [{ itemId: saleItem.id, quantityMilli: 8000, unitPricePaisa: null }],
    });

    // Hand calculation, in date order:
    // 2026-08-10  purchase  out 500,000   balance = -500,000
    // 2026-08-11  sale      in  300,000   balance = -500,000 + 300,000 = -200,000
    // 2026-08-12  purchase  out 200,000   balance = -200,000 - 200,000 = -400,000
    // 2026-08-13  sale      in  800,000   balance = -400,000 + 800,000 =  400,000
    const rows = await getCashBookReport(kysely, TENANT_ID, '2026-08-10', '2026-08-13');

    expect(rows).toHaveLength(4);
    expect(rows[0]?.date).toBe('2026-08-10');
    expect(rows[0]?.outPaisa).toBe(500000);
    expect(rows[0]?.inPaisa).toBe(0);
    expect(rows[0]?.runningBalancePaisa).toBe(-500000);

    expect(rows[1]?.date).toBe('2026-08-11');
    expect(rows[1]?.inPaisa).toBe(300000);
    expect(rows[1]?.runningBalancePaisa).toBe(-200000);

    expect(rows[2]?.date).toBe('2026-08-12');
    expect(rows[2]?.outPaisa).toBe(200000);
    expect(rows[2]?.runningBalancePaisa).toBe(-400000);

    expect(rows[3]?.date).toBe('2026-08-13');
    expect(rows[3]?.inPaisa).toBe(800000);
    expect(rows[3]?.runningBalancePaisa).toBe(400000);
  });
});

describe('R3 — getReceivablesAgingReport', () => {
  it('buckets party_ledger entries by age from an as-of date; buckets sum to each customer total', async () => {
    const AS_OF_DATE = '2026-08-29';

    // Customer 1 — TWO entries, deliberately spanning two buckets, to
    // prove per-entry bucketing, not just per-customer bucketing:
    //   2026-08-15 -> 14 days old  -> current (<=30)     amount +200,000
    //   2026-07-15 -> 45 days old  -> 31-60               amount +300,000
    //   total = 500,000
    const customer1 = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Split Customer',
      shopName: null,
      phone: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    insertLedgerEntry(customer1.id, '2026-08-15', 200000);
    insertLedgerEntry(customer1.id, '2026-07-15', 300000);

    // Customer 2 — ONE entry, 2026-06-15 -> 75 days old -> 61-90 bucket
    //   total = 400,000
    const customer2 = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Old Customer',
      shopName: null,
      phone: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    insertLedgerEntry(customer2.id, '2026-06-15', 400000);

    // Customer 3 — ONE entry, 2026-01-01 -> well over 90 days -> over90 bucket
    //   total = 500,000
    const customer3 = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Very Old Customer',
      shopName: null,
      phone: null,
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: null,
    });
    insertLedgerEntry(customer3.id, '2026-01-01', 500000);

    // Hand calculation, day counts from AS_OF_DATE = 2026-08-29:
    //   2026-08-15 -> 14 days  (<=30           -> current)
    //   2026-07-15 -> 45 days  (31..60          -> 31-60)
    //   2026-06-15 -> 75 days  (61..90          -> 61-90)
    //   2026-01-01 -> 240 days (>90             -> over90)
    const rows = await getReceivablesAgingReport(kysely, TENANT_ID, AS_OF_DATE);

    const row1 = rows.find((r) => r.customerId === customer1.id);
    expect(row1).toBeDefined();
    expect(row1?.currentPaisa).toBe(200000);
    expect(row1?.days31To60Paisa).toBe(300000);
    expect(row1?.days61To90Paisa).toBe(0);
    expect(row1?.over90Paisa).toBe(0);
    expect(row1?.totalBalancePaisa).toBe(500000);
    // buckets sum to total, for this customer
    expect(
      (row1?.currentPaisa ?? 0) +
        (row1?.days31To60Paisa ?? 0) +
        (row1?.days61To90Paisa ?? 0) +
        (row1?.over90Paisa ?? 0),
    ).toBe(row1?.totalBalancePaisa);

    const row2 = rows.find((r) => r.customerId === customer2.id);
    expect(row2).toBeDefined();
    expect(row2?.currentPaisa).toBe(0);
    expect(row2?.days31To60Paisa).toBe(0);
    expect(row2?.days61To90Paisa).toBe(400000);
    expect(row2?.over90Paisa).toBe(0);
    expect(row2?.totalBalancePaisa).toBe(400000);

    const row3 = rows.find((r) => r.customerId === customer3.id);
    expect(row3).toBeDefined();
    expect(row3?.currentPaisa).toBe(0);
    expect(row3?.days31To60Paisa).toBe(0);
    expect(row3?.days61To90Paisa).toBe(0);
    expect(row3?.over90Paisa).toBe(500000);
    expect(row3?.totalBalancePaisa).toBe(500000);

    // Grand check: sum of every customer's every bucket equals sum of
    // every customer's total — buckets fully partition the balance.
    const sumOfAllBuckets = rows.reduce(
      (acc, r) => acc + r.currentPaisa + r.days31To60Paisa + r.days61To90Paisa + r.over90Paisa,
      0,
    );
    const sumOfAllTotals = rows.reduce((acc, r) => acc + r.totalBalancePaisa, 0);
    expect(sumOfAllBuckets).toBe(sumOfAllTotals);
    expect(sumOfAllTotals).toBe(1400000); // 500,000 + 400,000 + 500,000
  });
});

describe('R5 — getUnitPlReport', () => {
  it('computes revenue/COGS/direct margin per business unit, and Parts + Repair = Total', async () => {
    const SALE_DATE = '2026-08-20';

    // PARTS: item with a real last-purchase cost, sold 2 units.
    //   revenue = 500,000 x 2000 / 1000 = 1,000,000 paisa
    //   cogs    = 300,000 x 2000 / 1000 =   600,000 paisa
    //   direct margin = 1,000,000 - 600,000 = 400,000 paisa (40%)
    const partsItem = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Parts Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 500000,
    });
    setLastPurchaseCost(partsItem.id, 300000);
    insertStockMovement(partsItem.id, 10000);
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: SALE_DATE,
      paymentMode: 'cash',
      paidAmountPaisa: 1000000,
      notes: null,
      lines: [{ itemId: partsItem.id, quantityMilli: 2000, unitPricePaisa: null }],
    });

    // REPAIR: labour item, no stock, no cost ever recorded (unit_cost
    // snapshots as NULL -> COALESCE 0 in v_unit_revenue). Sold 1 unit.
    //   revenue = 800,000 x 1000 / 1000 = 800,000 paisa
    //   cogs    = 0 (no cost -> unitCostMissing warning, sale still commits)
    //   direct margin = 800,000 - 0 = 800,000 paisa (100%)
    const repairItem = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'AC Gas Charging (labour)',
      nameUr: null,
      businessUnitId: repairBusinessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: false,
      retailPricePaisa: 800000,
    });
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: SALE_DATE,
      paymentMode: 'cash',
      paidAmountPaisa: 800000,
      notes: null,
      lines: [{ itemId: repairItem.id, quantityMilli: 1000, unitPricePaisa: null }],
    });

    // Hand calculation:
    //   Parts:  revenue 1,000,000  cogs 600,000  margin 400,000  (40.00%)
    //   Repair: revenue   800,000  cogs       0  margin 800,000  (100.00%)
    //   Total:  revenue 1,800,000  cogs 600,000  margin 1,200,000 (66.67%)
    //   Check:  Parts margin (400,000) + Repair margin (800,000) = Total margin (1,200,000)
    const report = await getUnitPlReport(kysely, TENANT_ID, SALE_DATE, SALE_DATE);

    expect(report.rows).toHaveLength(3);
    const parts = report.rows.find((r) => r.unitCode === 'PARTS');
    const repair = report.rows.find((r) => r.unitCode === 'REPAIR');
    const totalRow = report.rows.find((r) => r.unitCode === 'TOTAL');

    expect(parts?.unitName).toBe('Spare Parts');
    expect(parts?.revenuePaisa).toBe(1000000);
    expect(parts?.cogsPaisa).toBe(600000);
    expect(parts?.directMarginPaisa).toBe(400000);
    expect(parts?.directMarginPercent).toBe(40);

    expect(repair?.unitName).toBe('Repair');
    expect(repair?.revenuePaisa).toBe(800000);
    expect(repair?.cogsPaisa).toBe(0);
    expect(repair?.directMarginPaisa).toBe(800000);
    expect(repair?.directMarginPercent).toBe(100);

    expect(totalRow?.unitName).toBe('Total');
    expect(totalRow?.revenuePaisa).toBe(1800000);
    expect(totalRow?.cogsPaisa).toBe(600000);
    expect(totalRow?.directMarginPaisa).toBe(1200000);
    expect(totalRow?.directMarginPercent).toBe(66.67);

    // Parts margin + Repair margin = Total margin, checked independently
    // of the report's own Total row, not just trusting it matches itself.
    expect((parts?.directMarginPaisa ?? 0) + (repair?.directMarginPaisa ?? 0)).toBe(
      totalRow?.directMarginPaisa,
    );

    // CF-3 labelling
    for (const row of report.rows) {
      expect(row.cogsColumnLabel).toContain('(Last Purchase Cost)');
    }
    expect(report.disclaimer).toBe(
      'Margin shown uses last purchase cost per item. True weighted-average costing is Phase 8 work.',
    );
  });

  it('shows a zero row for a unit with no sales in the range, not an omitted row', async () => {
    // No sales seeded at all for this date range.
    const report = await getUnitPlReport(kysely, TENANT_ID, '2026-01-01', '2026-01-01');

    expect(report.rows).toHaveLength(3);
    for (const row of report.rows) {
      expect(row.revenuePaisa).toBe(0);
      expect(row.cogsPaisa).toBe(0);
      expect(row.directMarginPaisa).toBe(0);
    }
  });

  // P10-2b: report:unitPl now accepts { from, to } from the client instead
  // of a server-hardcoded all-time range. getUnitPlReport itself already
  // took dateFrom/dateTo — these prove the date filter it already runs
  // (sale_date BETWEEN, via v_unit_direct_margin) actually excludes/
  // includes a sale correctly, which the pre-existing tests above did not
  // specifically target with a sale placed OUTSIDE a real range.
  it('P10-2b: a sale outside the queried date range does not contribute revenue', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Out Of Range Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 400000,
    });
    insertStockMovement(item.id, 5000);

    // Rs 4,000 sale on 2026-08-20 — outside the September range queried below.
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-20',
      paymentMode: 'cash',
      paidAmountPaisa: 400000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 400000 }],
    });

    const report = await getUnitPlReport(kysely, TENANT_ID, '2026-09-01', '2026-09-30');

    const parts = report.rows.find((r) => r.unitCode === 'PARTS');
    // Outside the range -> excluded entirely -> 0 paisa
    expect(parts?.revenuePaisa).toBe(0);
  });

  it('P10-2b: a sale inside the queried date range contributes its exact revenue', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'In Range Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 400000,
    });
    insertStockMovement(item.id, 5000);

    // Rs 4,000 sale on 2026-08-20 — inside the August range queried below.
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-20',
      paymentMode: 'cash',
      paidAmountPaisa: 400000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 400000 }],
    });

    const report = await getUnitPlReport(kysely, TENANT_ID, '2026-08-01', '2026-08-31');

    const parts = report.rows.find((r) => r.unitCode === 'PARTS');
    // 1 sale x Rs 4,000 = 400,000 paisa
    expect(parts?.revenuePaisa).toBe(400000);
  });
});

describe('P10-2c — getStockPerformanceReport', () => {
  const RANGE_FROM = '2026-08-01';
  const RANGE_TO = '2026-08-31';

  it('sorts items by totalSoldMilli DESC — item A (sold more) appears before item B', async () => {
    const itemA = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Best Seller A',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(itemA.id, 20000);
    const itemB = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Slow Seller B',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(itemB.id, 20000);

    // A: 3 sales x 1000 milli = 3000 milli sold in range
    for (let i = 0; i < 3; i++) {
      await saleRepo.createSale({
        customerId: null,
        warehouseId: null,
        saleDate: '2026-08-10',
        paymentMode: 'cash',
        paidAmountPaisa: 100000,
        notes: null,
        lines: [{ itemId: itemA.id, quantityMilli: 1000, unitPricePaisa: 100000 }],
      });
    }
    // B: 1 sale x 1000 milli = 1000 milli sold in range
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-08-10',
      paymentMode: 'cash',
      paidAmountPaisa: 100000,
      notes: null,
      lines: [{ itemId: itemB.id, quantityMilli: 1000, unitPricePaisa: 100000 }],
    });

    const rows = await getStockPerformanceReport(kysely, TENANT_ID, RANGE_FROM, RANGE_TO);

    // A: 3 x 1000milli = 3000 milli, B: 1 x 1000milli = 1000 milli
    const rowA = rows.find((r) => r.itemId === itemA.id);
    const rowB = rows.find((r) => r.itemId === itemB.id);
    expect(rowA?.totalSoldMilli).toBe(3000);
    expect(rowB?.totalSoldMilli).toBe(1000);

    const indexA = rows.findIndex((r) => r.itemId === itemA.id);
    const indexB = rows.findIndex((r) => r.itemId === itemB.id);
    expect(indexA).toBeLessThan(indexB);
  });

  it('a sale outside the date range does not contribute to totalSoldMilli', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Outside Range Item',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    insertStockMovement(item.id, 10000);

    // Sold on 2026-07-15 — before RANGE_FROM ('2026-08-01').
    await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: '2026-07-15',
      paymentMode: 'cash',
      paidAmountPaisa: 100000,
      notes: null,
      lines: [{ itemId: item.id, quantityMilli: 1000, unitPricePaisa: 100000 }],
    });

    const rows = await getStockPerformanceReport(kysely, TENANT_ID, RANGE_FROM, RANGE_TO);

    const row = rows.find((r) => r.itemId === item.id);
    expect(row).toBeDefined();
    expect(row?.totalSoldMilli).toBe(0);
    expect(row?.revenuePaisa).toBe(0);
  });

  it('an item with stock but zero sales in range still appears (owner-confirmed P10-2c decision)', async () => {
    const item = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Never Sold This Month',
      nameUr: null,
      businessUnitId,
      stockUomId: uomId('Piece'),
      trackStock: true,
      retailPricePaisa: 100000,
    });
    // 5 pieces on hand (opening stock only, no sale ever).
    insertStockMovement(item.id, 5000);

    const rows = await getStockPerformanceReport(kysely, TENANT_ID, RANGE_FROM, RANGE_TO);

    const row = rows.find((r) => r.itemId === item.id);
    expect(row).toBeDefined();
    // 5 pieces on hand = 5000 milli
    expect(row?.quantityMilli).toBe(5000);
    expect(row?.totalSoldMilli).toBe(0);
    expect(row?.revenuePaisa).toBe(0);
  });
});

describe('P10-2d — getExpenseSummaryReport', () => {
  const RANGE_FROM = '2026-08-01';
  const RANGE_TO = '2026-08-31';

  it('groups by category + business unit, with correct totalPaisa and count per category', async () => {
    // 'Electricity' is already a seeded category name (bootstrap.ts) —
    // uses a distinct test-only name to avoid the tenant_id+name UNIQUE
    // constraint, same amounts/behavior the brief specifies for "Electricity".
    const electricityId = insertExpenseCategory('Test Electricity');
    const fuelId = insertExpenseCategory('Fuel');

    // Electricity #1: Rs 4,500 = 450,000 paisa, unit SHARED
    await expenseRepo.createExpense({
      categoryId: electricityId,
      expenseDate: '2026-08-05',
      amountPaisa: 450000,
      businessUnitId: sharedBusinessUnitId,
      vehicle: null,
      method: 'cash',
      notes: null,
    });
    // Electricity #2: Rs 2,000 = 200,000 paisa, unit SHARED
    await expenseRepo.createExpense({
      categoryId: electricityId,
      expenseDate: '2026-08-15',
      amountPaisa: 200000,
      businessUnitId: sharedBusinessUnitId,
      vehicle: null,
      method: 'cash',
      notes: null,
    });
    // Fuel: Rs 800 = 80,000 paisa, unit REPAIR
    await expenseRepo.createExpense({
      categoryId: fuelId,
      expenseDate: '2026-08-10',
      amountPaisa: 80000,
      businessUnitId: repairBusinessUnitId,
      vehicle: 'Bike-1',
      method: 'cash',
      notes: null,
    });

    const rows = await getExpenseSummaryReport(kysely, TENANT_ID, RANGE_FROM, RANGE_TO);

    expect(rows).toHaveLength(2);

    const electricity = rows.find((r) => r.categoryName === 'Test Electricity');
    // 450,000 + 200,000 = 650,000 paisa
    expect(electricity?.totalPaisa).toBe(650000);
    expect(electricity?.count).toBe(2);
    expect(electricity?.businessUnitCode).toBe('SHARED');

    const fuel = rows.find((r) => r.categoryName === 'Fuel');
    // Rs 800 = 80,000 paisa
    expect(fuel?.totalPaisa).toBe(80000);
    expect(fuel?.count).toBe(1);
    expect(fuel?.businessUnitCode).toBe('REPAIR');
  });

  it('an expense outside the date range does not appear', async () => {
    const categoryId = insertExpenseCategory('Phone/Internet');

    // Outside the queried range.
    await expenseRepo.createExpense({
      categoryId,
      expenseDate: '2026-09-05',
      amountPaisa: 300000,
      businessUnitId: sharedBusinessUnitId,
      vehicle: null,
      method: 'cash',
      notes: null,
    });

    const rows = await getExpenseSummaryReport(kysely, TENANT_ID, RANGE_FROM, RANGE_TO);

    expect(rows.find((r) => r.categoryName === 'Phone/Internet')).toBeUndefined();
  });

  it('excludes owner-drawing categories from the summary (they are not real expenses)', async () => {
    const drawingCategoryId = insertExpenseCategory('Owner Drawing', true);

    await expenseRepo.createExpense({
      categoryId: drawingCategoryId,
      expenseDate: '2026-08-12',
      amountPaisa: 1000000,
      businessUnitId: sharedBusinessUnitId,
      vehicle: null,
      method: 'cash',
      notes: null,
    });

    const rows = await getExpenseSummaryReport(kysely, TENANT_ID, RANGE_FROM, RANGE_TO);

    expect(rows.find((r) => r.categoryName === 'Owner Drawing')).toBeUndefined();
  });
});
