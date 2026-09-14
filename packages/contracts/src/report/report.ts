import { z } from 'zod';

/**
 * P4.5-6 — Reports screen. Every DTO here mirrors a return type in
 * packages/db/src/repositories/report.repository.ts exactly (see that
 * file for the SQL/business logic — this package only shapes the wire
 * format). R2/R3 take no input from the client at all: asOfDate is
 * computed server-side (today) so those screens' "no inputs" requirement
 * holds even at the wire level, not just in the UI. R5 (Unit P&L) took no
 * input either until P10-2b widened it to a client-supplied date range.
 */

// P10-2a: widened from a single `date` to a `{ from, to }` range — the
// repository function (getDailySalesReport) already took dateFrom/dateTo
// separately, so this only changes what the client can ask for. Passing
// from === to reproduces the old single-date behavior exactly.
export const DailySalesReportInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type DailySalesReportInput = z.infer<typeof DailySalesReportInput>;

/** Mirrors DailySalesReportRow exactly. */
export const DailySalesReportRowDto = z.object({
  date: z.string(),
  invoiceCount: z.number().int(),
  totalSalesPaisa: z.number().int(),
  cashCollectedPaisa: z.number().int(),
  creditGivenPaisa: z.number().int(),
});
export type DailySalesReportRowDto = z.infer<typeof DailySalesReportRowDto>;

/** Mirrors StockValuationLine exactly. */
export const StockValuationLineDto = z.object({
  itemId: z.string().uuid(),
  itemName: z.string(),
  stockUomName: z.string(),
  quantityOnHandMilli: z.number().int(),
  lastPurchaseCostPaisa: z.number().int(),
  valuationPaisa: z.number().int(),
});
export type StockValuationLineDto = z.infer<typeof StockValuationLineDto>;

/** Mirrors StockValuationReport exactly. */
export const StockValuationReportDto = z.object({
  costColumnLabel: z.string(),
  valuationColumnLabel: z.string(),
  lines: z.array(StockValuationLineDto),
  totalValuationPaisa: z.number().int(),
});
export type StockValuationReportDto = z.infer<typeof StockValuationReportDto>;

// P10-4: additive — asOfDate defaults to today server-side when omitted
// (unchanged behavior for any existing caller), so DateRangeSelector's
// `to` date can drive the aging bucket cutoff on the Receivables tab.
export const ReceivablesReportInput = z.object({
  asOfDate: z.string().min(1).optional(),
});
export type ReceivablesReportInput = z.infer<typeof ReceivablesReportInput>;

/** Mirrors ReceivablesAgingRow exactly. */
export const ReceivablesAgingRowDto = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  totalBalancePaisa: z.number().int(),
  currentPaisa: z.number().int(),
  days31To60Paisa: z.number().int(),
  days61To90Paisa: z.number().int(),
  over90Paisa: z.number().int(),
});
export type ReceivablesAgingRowDto = z.infer<typeof ReceivablesAgingRowDto>;

export const CashBookReportInput = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
});
export type CashBookReportInput = z.infer<typeof CashBookReportInput>;

/** Mirrors CashBookRow exactly — including runningBalancePaisa. */
export const CashBookRowDto = z.object({
  date: z.string(),
  docNo: z.string(),
  description: z.string(),
  inPaisa: z.number().int(),
  outPaisa: z.number().int(),
  runningBalancePaisa: z.number().int(),
});
export type CashBookRowDto = z.infer<typeof CashBookRowDto>;

// P10-2b: the repository function (getUnitPlReport) already took
// dateFrom/dateTo separately — only the handler hardcoded an all-time
// range. This lets the client actually choose one.
export const UnitPlReportInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type UnitPlReportInput = z.infer<typeof UnitPlReportInput>;

/** Mirrors UnitPlRow exactly. */
export const UnitPlRowDto = z.object({
  unitCode: z.enum(['PARTS', 'REPAIR', 'TOTAL']),
  unitName: z.string(),
  revenuePaisa: z.number().int(),
  cogsPaisa: z.number().int(),
  cogsColumnLabel: z.string(),
  directMarginPaisa: z.number().int(),
  directMarginPercent: z.number(),
});
export type UnitPlRowDto = z.infer<typeof UnitPlRowDto>;

/** Mirrors UnitPlReport exactly. */
export const UnitPlReportDto = z.object({
  rows: z.array(UnitPlRowDto),
  disclaimer: z.string(),
});
export type UnitPlReportDto = z.infer<typeof UnitPlReportDto>;

// P10-2c: new report, no prior view. quantityMilli is all-time stock on
// hand; totalSoldMilli/revenuePaisa are scoped to [from, to]. Every
// track_stock item appears (owner-confirmed) — a zero-sale item still
// returns a row with totalSoldMilli/revenuePaisa both 0.
export const StockPerformanceInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type StockPerformanceInput = z.infer<typeof StockPerformanceInput>;

/** Mirrors StockPerformanceRow exactly. */
export const StockPerformanceRowDto = z.object({
  itemId: z.string().uuid(),
  itemName: z.string(),
  unitName: z.string(),
  quantityMilli: z.number().int(),
  totalSoldMilli: z.number().int(),
  revenuePaisa: z.number().int(),
});
export type StockPerformanceRowDto = z.infer<typeof StockPerformanceRowDto>;

// P10-2d: new report, no prior view. Owner-drawing expense categories are
// excluded server-side (see getExpenseSummaryReport's own comment) —
// never returned in this DTO, not filtered client-side.
export const ExpenseSummaryInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type ExpenseSummaryInput = z.infer<typeof ExpenseSummaryInput>;

/** Mirrors ExpenseSummaryRow exactly. */
export const ExpenseSummaryRowDto = z.object({
  categoryName: z.string(),
  businessUnitCode: z.string(),
  totalPaisa: z.number().int(),
  count: z.number().int(),
});
export type ExpenseSummaryRowDto = z.infer<typeof ExpenseSummaryRowDto>;

// P11-4a: current vs. previous period comparison, powering the Sales tab's
// sparklines/trend indicators. Both ranges are computed client-side
// (DateRangeSelector + dateRanges.ts's getPreviousPeriod) and passed
// explicitly — the handler never derives previous from current.
export const PeriodComparisonInput = z.object({
  current: z.object({ from: z.string().min(1), to: z.string().min(1) }),
  previous: z.object({ from: z.string().min(1), to: z.string().min(1) }),
});
export type PeriodComparisonInput = z.infer<typeof PeriodComparisonInput>;

/** Mirrors DayBucket exactly (report.repository.ts). */
export const DayBucketDto = z.object({
  date: z.string(),
  totalPaisa: z.number().int(),
  cashPaisa: z.number().int(),
  creditPaisa: z.number().int(),
  transactionCount: z.number().int(),
});
export type DayBucketDto = z.infer<typeof DayBucketDto>;

/** Mirrors PeriodComparisonReport exactly. */
export const PeriodComparisonDto = z.object({
  current: z.array(DayBucketDto),
  previous: z.array(DayBucketDto),
});
export type PeriodComparisonDto = z.infer<typeof PeriodComparisonDto>;

// P11-4b: per-item sold summary, powering the Sales tab's "What Was Sold"
// table. Labour lines (sale_line.item_id IS NULL) never appear — enforced
// server-side by the query's inner JOIN item, not filtered client-side.
export const ItemSoldSummaryInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type ItemSoldSummaryInput = z.infer<typeof ItemSoldSummaryInput>;

/** Mirrors ItemSoldSummaryRow exactly. Sorted by revenuePaisa DESC. */
export const ItemSoldSummaryRowDto = z.object({
  itemId: z.string().uuid(),
  itemName: z.string(),
  unitName: z.string(),
  totalSoldMilli: z.number().int(),
  revenuePaisa: z.number().int(),
});
export type ItemSoldSummaryRowDto = z.infer<typeof ItemSoldSummaryRowDto>;

export const WageMonthInput = z.object({
  year: z.number().int().min(2024).max(2099),
  month: z.number().int().min(1).max(12),
});
export type WageMonthInput = z.infer<typeof WageMonthInput>;

/**
 * Mirrors WageMonthRow (packages/db/src/repositories/wage-report.repository.ts)
 * exactly. One row per staff member with at least one attendance record
 * in the requested month — staff with zero attendance rows that month
 * are simply absent from the array, not returned with all-zero fields.
 */
export const WageMonthRowDto = z.object({
  staffId: z.string().uuid(),
  staffName: z.string(),
  staffRole: z.string(),
  fullDays: z.number().int(),
  halfDays: z.number().int(),
  absentDays: z.number().int(),
  leaveDays: z.number().int(),
  holidayDays: z.number().int(),
  grossPaisa: z.number().int(),
  advancesPaisa: z.number().int(),
  commissionPaisa: z.number().int(),
  netPaisa: z.number().int(),
});
export type WageMonthRowDto = z.infer<typeof WageMonthRowDto>;
