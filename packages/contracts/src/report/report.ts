import { z } from 'zod';

/**
 * P4.5-6 — Reports screen. Every DTO here mirrors a return type in
 * packages/db/src/repositories/report.repository.ts exactly (see that
 * file for the SQL/business logic — this package only shapes the wire
 * format). R2/R3/R5 take no input from the client at all: asOfDate/date
 * range are computed server-side (today, and an all-time range
 * respectively) so the screen's "no inputs" requirement holds even at
 * the wire level, not just in the UI.
 */

export const DailySalesReportInput = z.object({
  date: z.string().min(1),
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
