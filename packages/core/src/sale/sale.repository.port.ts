/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See docs/ARCHITECTURE.md
 * section 2, "Why the domain layer is pure."
 *
 * P3-2 scope: counter sale create/get/cancel. Price resolution, credit
 * limit, and stock warnings are computed in packages/core/src/sale/sale.ts
 * — the repository feeds those pure functions pre-fetched data.
 */
export type SalePaymentMode = 'cash' | 'credit';

export interface NewSaleLineInput {
  readonly itemId: string;
  readonly quantityMilli: number;
  /** Explicit override; null runs the standard price resolution order. */
  readonly unitPricePaisa: number | null;
  // ADR-0013 Type 2 (item-specific alt-unit selling). Absent/undefined
  // means the line was entered in stock_uom — matches SaleLineInput's
  // Zod .optional() fields (mirrors NewItemInput's altUomId/
  // altUomFactorMilli pattern from P3.5G).
  readonly saleUomId?: string | undefined;
  readonly saleToStockFactor?: number | undefined;
}

export interface NewSaleInput {
  readonly customerId: string | null;
  /** null = the tenant's default warehouse (seeded "Shop"). */
  readonly warehouseId: string | null;
  readonly saleDate: string;
  readonly paymentMode: SalePaymentMode;
  readonly paidAmountPaisa: number;
  readonly notes: string | null;
  readonly lines: readonly NewSaleLineInput[];
}

export interface SaleWarnings {
  readonly creditLimitExceeded: boolean;
  readonly stockBelowZero: boolean;
  readonly unitCostMissing: boolean;
}

export interface NewSaleResult {
  readonly id: string;
  readonly docNo: string;
  readonly totalAmountPaisa: number;
  readonly warnings: SaleWarnings;
}

export interface SaleLineRecord {
  readonly itemId: string;
  readonly quantityMilli: number;
  readonly unitPricePaisa: number;
  readonly unitCostPaisa: number | null;
  readonly lineTotalPaisa: number;
  readonly businessUnitId: string;
}

export interface SaleRecord {
  readonly id: string;
  readonly docNo: string;
  readonly customerId: string | null;
  readonly warehouseId: string;
  readonly saleDate: string;
  readonly paymentMode: SalePaymentMode;
  readonly totalAmountPaisa: number;
  readonly paidAmountPaisa: number;
  readonly status: string;
  readonly lines: readonly SaleLineRecord[];
}

/** All fields optional/null — an unset field is not filtered on. */
export interface SaleSearchQuery {
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly customerId: string | null;
  readonly status: string | null;
}

/** Line-free summary row — a list view has no use for per-line detail. */
export interface SaleSummaryRecord {
  readonly id: string;
  readonly docNo: string;
  readonly customerId: string | null;
  readonly saleDate: string;
  readonly paymentMode: string | null;
  readonly totalAmountPaisa: number;
  readonly paidAmountPaisa: number;
  readonly status: string;
}

export interface SaleRepositoryPort {
  /**
   * Inserts sale + sale_line (unit_cost snapshot) + stock_movement
   * (negative) per line + party_ledger (positive, credit only) +
   * audit_log + sync_outbox in one transaction. Write path — must be
   * wrapped in withRetry (PROJECT.md BUG-15).
   */
  createSale(input: NewSaleInput): Promise<NewSaleResult>;
  getSaleById(id: string): Promise<SaleRecord | null>;
  /** Plain filtered SELECT, most recent first — no business logic. */
  listSalesByDate(query: SaleSearchQuery): Promise<readonly SaleSummaryRecord[]>;
  /**
   * Reverses a confirmed sale: posts reversing stock_movement rows (and,
   * for a credit sale, a reversing party_ledger row) bringing net stock
   * and net balance back to their pre-sale levels. Never deletes or
   * updates stock_movement/party_ledger rows. Sets sale.status =
   * 'cancelled' (an UPDATE — sale is not append-only, unlike those two
   * tables; ADR-0004 / docs/DATABASE_RULES.md §3).
   */
  cancelSale(id: string): Promise<void>;
}
