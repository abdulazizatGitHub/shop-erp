import { sql, type Kysely } from 'kysely';
import { Money, type Paisa } from '@shop/shared';
import type { Database } from '../kysely-schema.js';

// P4-3 R1-R5. Every function here reads from an existing view — see
// docs/SYSTEM_DESIGN.md section 7 ("reports read from views, never
// re-implement the aggregation in TypeScript"). Aggregation across
// warehouses (R2) or further joins happen in SQL, on top of the view's
// own output, not as a second re-derivation of the view's own sums.

const LAST_PURCHASE_COST_LABEL = 'Last Purchase Cost';
const VALUATION_LABEL = 'Valuation (Last Purchase Cost)';

export interface StockValuationLine {
  readonly itemId: string;
  readonly itemName: string;
  readonly stockUomName: string;
  readonly quantityOnHandMilli: number;
  readonly lastPurchaseCostPaisa: number;
  readonly valuationPaisa: number;
}

export interface StockValuationReport {
  readonly costColumnLabel: string;
  readonly valuationColumnLabel: string;
  readonly lines: readonly StockValuationLine[];
  readonly totalValuationPaisa: number;
}

interface StockValuationRow {
  itemId: string;
  itemName: string;
  stockUomName: string;
  quantityOnHandMilli: number;
  lastPurchaseCostPaisa: number | null;
}

/**
 * R2 — stock on hand + valuation. CF-3: item.avg_cost is NOT a true
 * weighted average (every purchase overwrites it to the incoming
 * cost — see purchase.repository.ts createPurchase). This reads
 * item.last_purchase_cost instead, the honestly-named column that
 * createPurchase keeps in sync with avg_cost, and always labels it
 * "Last Purchase Cost" — never "Cost" or "Average Cost".
 */
export async function getStockValuationReport(
  db: Kysely<Database>,
  tenantId: string,
): Promise<StockValuationReport> {
  const result = await sql<StockValuationRow>`
    SELECT
      i.id                            AS itemId,
      i.name_en                       AS itemName,
      u.name                          AS stockUomName,
      COALESCE(SUM(v.qty_milli), 0)   AS quantityOnHandMilli,
      i.last_purchase_cost            AS lastPurchaseCostPaisa
    FROM        item i
    JOIN        uom u ON u.id = i.stock_uom_id
    LEFT JOIN   v_stock_on_hand v ON v.item_id = i.id AND v.tenant_id = i.tenant_id
    WHERE       i.tenant_id = ${tenantId} AND i.deleted_at IS NULL
    GROUP BY    i.id, i.name_en, u.name, i.last_purchase_cost
    ORDER BY    i.name_en
  `.execute(db);

  const lines: StockValuationLine[] = result.rows.map((row) => {
    const costPaisa = (row.lastPurchaseCostPaisa ?? 0) as Paisa;
    const valuationPaisa = Money.multiplyByQuantity(costPaisa, row.quantityOnHandMilli);
    return {
      itemId: row.itemId,
      itemName: row.itemName,
      stockUomName: row.stockUomName,
      quantityOnHandMilli: row.quantityOnHandMilli,
      lastPurchaseCostPaisa: costPaisa,
      valuationPaisa,
    };
  });

  const totalValuationPaisa = Money.sum(lines.map((line) => line.valuationPaisa as Paisa));

  return {
    costColumnLabel: LAST_PURCHASE_COST_LABEL,
    valuationColumnLabel: VALUATION_LABEL,
    lines,
    totalValuationPaisa,
  };
}

export interface DailySalesReportRow {
  readonly date: string;
  readonly invoiceCount: number;
  readonly totalSalesPaisa: number;
  readonly cashCollectedPaisa: number;
  readonly creditGivenPaisa: number;
}

/**
 * R1 — daily sales summary. Reads v_daily_sales directly, one row per
 * date in [dateFrom, dateTo] (inclusive) that has at least one
 * confirmed sale. Column names follow the view's own
 * (cash_collected_paisa / credit_given_paisa), not the phase brief's
 * (total_cash_paisa / total_credit_paisa) — flagged when the view was
 * first read; not renamed to avoid pretending the view has columns it
 * doesn't.
 */
export async function getDailySalesReport(
  db: Kysely<Database>,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<readonly DailySalesReportRow[]> {
  const result = await sql<DailySalesReportRow>`
    SELECT
      sale_date            AS date,
      invoice_count        AS invoiceCount,
      total_sales_paisa    AS totalSalesPaisa,
      cash_collected_paisa AS cashCollectedPaisa,
      credit_given_paisa   AS creditGivenPaisa
    FROM        v_daily_sales
    WHERE       tenant_id = ${tenantId}
      AND       sale_date BETWEEN ${dateFrom} AND ${dateTo}
    ORDER BY    sale_date
  `.execute(db);

  return result.rows;
}

export interface DayBucket {
  readonly date: string;
  readonly totalPaisa: number;
  readonly cashPaisa: number;
  readonly creditPaisa: number;
  readonly transactionCount: number;
}

export interface PeriodComparisonReport {
  readonly current: readonly DayBucket[];
  readonly previous: readonly DayBucket[];
}

function toDayBucket(row: DailySalesReportRow): DayBucket {
  return {
    date: row.date,
    totalPaisa: row.totalSalesPaisa,
    cashPaisa: row.cashCollectedPaisa,
    creditPaisa: row.creditGivenPaisa,
    transactionCount: row.invoiceCount,
  };
}

/**
 * P11-4a — current vs. previous period, both ranges supplied explicitly by
 * the caller (the handler never derives previous from current — that's
 * dateRanges.ts's getPreviousPeriod, client-side, keeping this thin).
 * Reuses getDailySalesReport (same v_daily_sales query) rather than a
 * second hand-written query against the same view — v_daily_sales already
 * has every column DayBucket needs (cash_collected_paisa/credit_given_paisa
 * map directly to cashPaisa/creditPaisa). Calling it twice via Promise.all
 * is sequential in practice (better-sqlite3 has no async I/O — each call
 * completes synchronously before the next begins), not true concurrency;
 * safe here regardless since both are independent read-only queries.
 */
export async function getPeriodComparisonReport(
  db: Kysely<Database>,
  tenantId: string,
  current: { readonly from: string; readonly to: string },
  previous: { readonly from: string; readonly to: string },
): Promise<PeriodComparisonReport> {
  const [currentRows, previousRows] = await Promise.all([
    getDailySalesReport(db, tenantId, current.from, current.to),
    getDailySalesReport(db, tenantId, previous.from, previous.to),
  ]);
  return {
    current: currentRows.map(toDayBucket),
    previous: previousRows.map(toDayBucket),
  };
}

interface CashBookSourceRow {
  date: string;
  docNo: string;
  description: string;
  inPaisa: number;
  outPaisa: number;
}

export interface CashBookRow {
  readonly date: string;
  readonly docNo: string;
  readonly description: string;
  readonly inPaisa: number;
  readonly outPaisa: number;
  readonly runningBalancePaisa: number;
}

/**
 * R4 — cash book. No view backs this one; per the resolved Q12 (see
 * PROJECT.md), there is no cash_movement table. Outflows read
 * purchase.payment_mode='cash' directly; inflows are the union of cash
 * actually collected at sale time (sale.paid_amount) and later
 * customer payments (payment WHERE direction='in') — genuinely
 * separate events on separate dates, never double-counted. Never
 * party_ledger for either side (PHASE_3.md section 8's binding note —
 * its sign convention is incompatible with payment.amount).
 * runningBalancePaisa is accumulated in TypeScript using Money, over
 * rows the SQL below has already sorted — not re-deriving any
 * aggregate a view already computes, since no view exists for this.
 */
export async function getCashBookReport(
  db: Kysely<Database>,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<readonly CashBookRow[]> {
  const result = await sql<CashBookSourceRow>`
    SELECT purchase_date AS date, doc_no AS docNo, 'Cash purchase' AS description,
           0 AS inPaisa, total_amount AS outPaisa
    FROM        purchase
    WHERE       tenant_id = ${tenantId} AND payment_mode = 'cash' AND status != 'cancelled'
      AND       purchase_date BETWEEN ${dateFrom} AND ${dateTo}

    UNION ALL

    SELECT sale_date AS date, doc_no AS docNo, 'Cash sale' AS description,
           paid_amount AS inPaisa, 0 AS outPaisa
    FROM        sale
    WHERE       tenant_id = ${tenantId} AND status = 'confirmed' AND paid_amount > 0
      AND       sale_date BETWEEN ${dateFrom} AND ${dateTo}

    UNION ALL

    SELECT payment_date AS date, doc_no AS docNo, 'Payment received' AS description,
           amount AS inPaisa, 0 AS outPaisa
    FROM        payment
    WHERE       tenant_id = ${tenantId} AND direction = 'in'
      AND       payment_date BETWEEN ${dateFrom} AND ${dateTo}

    ORDER BY    date, docNo
  `.execute(db);

  let runningBalance = Money.ZERO;
  return result.rows.map((row): CashBookRow => {
    runningBalance = Money.add(
      Money.subtract(runningBalance, Money.of(row.outPaisa)),
      Money.of(row.inPaisa),
    );
    return {
      date: row.date,
      docNo: row.docNo,
      description: row.description,
      inPaisa: row.inPaisa,
      outPaisa: row.outPaisa,
      runningBalancePaisa: runningBalance,
    };
  });
}

export interface ReceivablesAgingRow {
  readonly customerId: string;
  readonly customerName: string;
  readonly totalBalancePaisa: number;
  readonly currentPaisa: number;
  readonly days31To60Paisa: number;
  readonly days61To90Paisa: number;
  readonly over90Paisa: number;
}

/**
 * R3 — receivables aging. v_party_balance alone isn't enough — it only
 * has one aggregate balance per party, no per-entry date. Bucketing
 * needs each party_ledger row's own entry_date, aged against asOfDate
 * via SQLite's julianday() (exact integer day counts for pure-date
 * strings, no time component). Buckets are an exact partition — every
 * row falls into exactly one CASE branch — so summing all 4 buckets
 * always equals summing party_ledger.amount directly; no double
 * counting or gaps possible by construction.
 */
export async function getReceivablesAgingReport(
  db: Kysely<Database>,
  tenantId: string,
  asOfDate: string,
): Promise<readonly ReceivablesAgingRow[]> {
  const result = await sql<{
    customerId: string;
    customerName: string;
    currentPaisa: number;
    days31To60Paisa: number;
    days61To90Paisa: number;
    over90Paisa: number;
  }>`
    SELECT
      p.id   AS customerId,
      p.name AS customerName,
      COALESCE(SUM(CASE
        WHEN (julianday(${asOfDate}) - julianday(pl.entry_date)) <= 30 THEN pl.amount
        ELSE 0 END), 0)                                              AS currentPaisa,
      COALESCE(SUM(CASE
        WHEN (julianday(${asOfDate}) - julianday(pl.entry_date)) BETWEEN 31 AND 60 THEN pl.amount
        ELSE 0 END), 0)                                              AS days31To60Paisa,
      COALESCE(SUM(CASE
        WHEN (julianday(${asOfDate}) - julianday(pl.entry_date)) BETWEEN 61 AND 90 THEN pl.amount
        ELSE 0 END), 0)                                              AS days61To90Paisa,
      COALESCE(SUM(CASE
        WHEN (julianday(${asOfDate}) - julianday(pl.entry_date)) > 90 THEN pl.amount
        ELSE 0 END), 0)                                              AS over90Paisa
    FROM        party p
    JOIN        party_ledger pl ON pl.party_id = p.id
    WHERE       p.tenant_id = ${tenantId}
      AND       p.party_type = 'customer'
      AND       p.deleted_at IS NULL
    GROUP BY    p.id, p.name
    ORDER BY    p.name
  `.execute(db);

  return result.rows.map((row): ReceivablesAgingRow => {
    const totalBalancePaisa = Money.sum([
      Money.of(row.currentPaisa),
      Money.of(row.days31To60Paisa),
      Money.of(row.days61To90Paisa),
      Money.of(row.over90Paisa),
    ]);
    return {
      customerId: row.customerId,
      customerName: row.customerName,
      totalBalancePaisa,
      currentPaisa: row.currentPaisa,
      days31To60Paisa: row.days31To60Paisa,
      days61To90Paisa: row.days61To90Paisa,
      over90Paisa: row.over90Paisa,
    };
  });
}

const COGS_LABEL = 'COGS (Last Purchase Cost)';
// R5-specific wording from the phase brief, used verbatim — the general
// CF-3 section elsewhere states a slightly different sentence for the
// same disclaimer. Flagged, not silently reconciled; see PROGRESS.md.
const UNIT_PL_DISCLAIMER =
  'Margin shown uses last purchase cost per item. True weighted-average costing is Phase 8 work.';

// Fixed, non-configurable pair — matches bootstrap.ts's own BUSINESS_UNITS
// seed exactly (ADR-0010: "Codes and shape are fixed; do not make this
// configurable"). Not worth a join to business_unit for two static names.
const UNIT_NAMES: Record<'PARTS' | 'REPAIR', string> = {
  PARTS: 'Spare Parts',
  REPAIR: 'Repair',
};

export interface UnitPlRow {
  readonly unitCode: 'PARTS' | 'REPAIR' | 'TOTAL';
  readonly unitName: string;
  readonly revenuePaisa: number;
  readonly cogsPaisa: number;
  readonly cogsColumnLabel: string;
  readonly directMarginPaisa: number;
  readonly directMarginPercent: number;
}

export interface UnitPlReport {
  readonly rows: readonly UnitPlRow[];
  readonly disclaimer: string;
}

function roundPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * R5 — direct margin by business unit. Reads v_unit_direct_margin
 * (own comment: "This is FACT — no allocation assumptions"), summed
 * across the date range per unit — not re-deriving revenue/cogs from
 * sale_line directly, since the view already computes that. SHARED is
 * never included (no sale_line is ever tagged to it in this schema —
 * see docs/SYSTEM_DESIGN.md section 4). Always returns exactly 3 rows
 * (Parts, Repair, Total) even when a unit had zero activity in range,
 * so the report shape never depends on which units happened to sell
 * something. CF-3: COGS is last-purchase-cost, never called "Average
 * Cost", and the disclaimer always accompanies the figures.
 */
export async function getUnitPlReport(
  db: Kysely<Database>,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<UnitPlReport> {
  const result = await sql<{
    unitCode: 'PARTS' | 'REPAIR';
    revenuePaisa: number;
    cogsPaisa: number;
  }>`
    SELECT
      unit_code                    AS unitCode,
      SUM(revenue_paisa)           AS revenuePaisa,
      SUM(cogs_paisa)              AS cogsPaisa
    FROM        v_unit_direct_margin
    WHERE       tenant_id = ${tenantId}
      AND       unit_code IN ('PARTS', 'REPAIR')
      AND       sale_date BETWEEN ${dateFrom} AND ${dateTo}
    GROUP BY    unit_code
  `.execute(db);

  const byUnit = new Map(result.rows.map((row) => [row.unitCode, row]));

  const unitRows: UnitPlRow[] = (['PARTS', 'REPAIR'] as const).map((unitCode) => {
    const found = byUnit.get(unitCode);
    const revenuePaisa = found?.revenuePaisa ?? 0;
    const cogsPaisa = found?.cogsPaisa ?? 0;
    const directMarginPaisa = Money.subtract(Money.of(revenuePaisa), Money.of(cogsPaisa));
    return {
      unitCode,
      unitName: UNIT_NAMES[unitCode],
      revenuePaisa,
      cogsPaisa,
      cogsColumnLabel: COGS_LABEL,
      directMarginPaisa,
      directMarginPercent: roundPercent(directMarginPaisa, revenuePaisa),
    };
  });

  const totalRevenuePaisa = Money.sum(unitRows.map((r) => Money.of(r.revenuePaisa)));
  const totalCogsPaisa = Money.sum(unitRows.map((r) => Money.of(r.cogsPaisa)));
  const totalDirectMarginPaisa = Money.sum(unitRows.map((r) => Money.of(r.directMarginPaisa)));

  const totalRow: UnitPlRow = {
    unitCode: 'TOTAL',
    unitName: 'Total',
    revenuePaisa: totalRevenuePaisa,
    cogsPaisa: totalCogsPaisa,
    cogsColumnLabel: COGS_LABEL,
    directMarginPaisa: totalDirectMarginPaisa,
    directMarginPercent: roundPercent(totalDirectMarginPaisa, totalRevenuePaisa),
  };

  return {
    rows: [...unitRows, totalRow],
    disclaimer: UNIT_PL_DISCLAIMER,
  };
}

export interface StockPerformanceRow {
  readonly itemId: string;
  readonly itemName: string;
  readonly unitName: string;
  readonly quantityMilli: number;
  readonly totalSoldMilli: number;
  readonly revenuePaisa: number;
}

interface StockPerformanceSourceRow {
  itemId: string;
  itemName: string;
  unitName: string;
  quantityMilli: number | null;
  totalSoldMilli: number;
  revenuePaisa: number;
}

/**
 * P10-2c — new (no prior view). quantityMilli is current stock on hand,
 * all-time, all warehouses — same v_stock_on_hand scalar-subquery pattern
 * item.repository.ts already uses for the same figure. totalSoldMilli/
 * revenuePaisa are scoped to [dateFrom, dateTo] only, via two separate
 * pre-aggregated subqueries (no per-row business logic, just SUM/GROUP
 * BY) joined onto every track_stock item — a zero-sale item in range
 * still appears, with both figures at 0 (owner-confirmed, P10-2c).
 * Sorted by totalSoldMilli DESC (best sellers first).
 */
export async function getStockPerformanceReport(
  db: Kysely<Database>,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<readonly StockPerformanceRow[]> {
  const result = await sql<StockPerformanceSourceRow>`
    SELECT
      i.id                                      AS itemId,
      i.name_en                                 AS itemName,
      u.name                                     AS unitName,
      (SELECT SUM(qty_milli) FROM v_stock_on_hand
         WHERE item_id = i.id AND tenant_id = i.tenant_id)   AS quantityMilli,
      COALESCE(sold.totalSoldMilli, 0)          AS totalSoldMilli,
      COALESCE(rev.revenuePaisa, 0)             AS revenuePaisa
    FROM        item i
    JOIN        uom u ON u.id = i.stock_uom_id
    LEFT JOIN (
      SELECT      item_id, SUM(-quantity) AS totalSoldMilli
      FROM        stock_movement
      WHERE       tenant_id = ${tenantId} AND movement_type = 'sale'
        AND       movement_date BETWEEN ${dateFrom} AND ${dateTo}
      GROUP BY    item_id
    ) sold ON sold.item_id = i.id
    LEFT JOIN (
      SELECT      sl.item_id, SUM(sl.line_total) AS revenuePaisa
      FROM        sale_line sl
      JOIN        sale s ON s.id = sl.sale_id
      WHERE       sl.tenant_id = ${tenantId} AND s.status = 'confirmed'
        AND       s.sale_date BETWEEN ${dateFrom} AND ${dateTo}
      GROUP BY    sl.item_id
    ) rev ON rev.item_id = i.id
    WHERE       i.tenant_id = ${tenantId} AND i.deleted_at IS NULL AND i.track_stock = 1
    ORDER BY    totalSoldMilli DESC
  `.execute(db);

  return result.rows.map((row) => ({
    ...row,
    quantityMilli: row.quantityMilli ?? 0,
  }));
}

export interface ItemSoldSummaryRow {
  readonly itemId: string;
  readonly itemName: string;
  readonly unitName: string;
  readonly totalSoldMilli: number;
  readonly revenuePaisa: number;
}

/**
 * P11-4b — per-item sold summary for the Sales tab's "What Was Sold"
 * table. sale_line's real columns are `quantity` (milli-units) and
 * `line_total` (paisa) — not `quantity_milli`/`total_paisa`, confirmed by
 * reading the live DDL (0011_sale_line_item_optional.sql) rather than
 * assumed. `s.status = 'confirmed'` follows the existing
 * getStockPerformanceReport revenue-subquery precedent (P10-2c) — a
 * cancelled sale's sale_line rows still physically exist and must not
 * inflate these figures. `sl.item_id IS NOT NULL` is redundant with the
 * inner `JOIN item` (which can never match a NULL item_id) but kept for
 * documentation clarity, per instruction. Sorted by revenuePaisa DESC.
 */
export async function getItemSoldSummaryReport(
  db: Kysely<Database>,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<readonly ItemSoldSummaryRow[]> {
  const result = await sql<ItemSoldSummaryRow>`
    SELECT
      sl.item_id                    AS itemId,
      i.name_en                     AS itemName,
      u.name                        AS unitName,
      SUM(sl.quantity)              AS totalSoldMilli,
      SUM(sl.line_total)            AS revenuePaisa
    FROM        sale_line sl
    JOIN        sale s ON s.id = sl.sale_id
    JOIN        item i ON i.id = sl.item_id
    JOIN        uom u  ON u.id = i.stock_uom_id
    WHERE       sl.tenant_id = ${tenantId}
      AND       s.status = 'confirmed'
      AND       sl.item_id IS NOT NULL
      AND       s.sale_date BETWEEN ${dateFrom} AND ${dateTo}
    GROUP BY    sl.item_id, i.name_en, u.name
    ORDER BY    revenuePaisa DESC
  `.execute(db);

  return result.rows;
}

export interface ExpenseSummaryRow {
  readonly categoryName: string;
  readonly businessUnitCode: string;
  readonly totalPaisa: number;
  readonly count: number;
}

/**
 * P10-2d — new (no prior view). Owner-drawing categories
 * (expense_category.is_owner_drawing = 1, "not a real expense" per its
 * own column comment) are excluded, matching the existing
 * v_unit_direct_expense/v_owner_drawings precedent (0003_shared_overhead.sql)
 * of reporting drawings separately rather than folding them into expense
 * totals. Grouped by category + business unit for the given date range.
 */
export async function getExpenseSummaryReport(
  db: Kysely<Database>,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<readonly ExpenseSummaryRow[]> {
  const result = await sql<ExpenseSummaryRow>`
    SELECT
      ec.name                      AS categoryName,
      bu.code                      AS businessUnitCode,
      SUM(e.amount)                AS totalPaisa,
      COUNT(*)                     AS count
    FROM        expense e
    JOIN        expense_category ec ON ec.id = e.category_id
    JOIN        business_unit bu    ON bu.id = e.business_unit_id
    WHERE       e.tenant_id = ${tenantId}
      AND       ec.is_owner_drawing = 0
      AND       e.expense_date BETWEEN ${dateFrom} AND ${dateTo}
    GROUP BY    ec.name, bu.code
    ORDER BY    ec.name, bu.code
  `.execute(db);

  return result.rows;
}
