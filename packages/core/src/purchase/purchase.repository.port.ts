/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See docs/ARCHITECTURE.md
 * section 2, "Why the domain layer is pure."
 *
 * P2-2 scope: create a purchase (cash or credit) and cancel one. See
 * docs/phases/PHASE_2.md "Design decisions" for the avg_cost
 * simplification and the party_ledger sign convention this repository
 * follows (party_ledger.amount is NEGATIVE on a credit purchase — the
 * shop's balance toward the supplier goes down, matching the schema's
 * documented "+ve = party owes US" convention used by v_party_balance).
 */
export type PurchasePaymentMode = 'cash' | 'credit';

export interface NewPurchaseLineInput {
  readonly itemId: string;
  /** milli-units, in the item's purchase UoM (not necessarily stock UoM). */
  readonly quantityMilli: number;
  /** paisa, per ONE purchase-UoM unit — e.g. price per cylinder, not per kg. */
  readonly unitCostPaisa: number;
  readonly notes: string | null;
}

export interface NewPurchaseInput {
  readonly supplierId: string;
  /** null = the tenant's default warehouse (seeded "Shop"). */
  readonly warehouseId: string | null;
  /** ISO date, e.g. "2026-08-24". */
  readonly purchaseDate: string;
  readonly supplierInvoiceNo: string | null;
  readonly paymentMode: PurchasePaymentMode;
  /** Credit only. Written onto party_ledger's migration-0004 columns; NULL for cash (no row exists). */
  readonly billReference: string | null;
  readonly dueDate: string | null;
  readonly billNotes: string | null;
  readonly notes: string | null;
  readonly lines: readonly NewPurchaseLineInput[];
}

export interface NewPurchaseResult {
  readonly id: string;
  readonly docNo: string;
  readonly totalAmountPaisa: number;
}

export interface PurchaseLineRecord {
  readonly itemId: string;
  /** milli-units, in purchase UoM, as entered. */
  readonly quantityMilli: number;
  /** milli-units, converted to stock UoM — what actually posted to stock_movement. */
  readonly stockQuantityMilli: number;
  /** paisa, per purchase-UoM unit, as entered. */
  readonly unitCostPaisa: number;
  readonly lineTotalPaisa: number;
}

export interface PurchaseRecord {
  readonly id: string;
  readonly docNo: string;
  readonly supplierId: string;
  readonly warehouseId: string;
  readonly purchaseDate: string;
  readonly paymentMode: PurchasePaymentMode;
  readonly totalAmountPaisa: number;
  readonly paidAmountPaisa: number;
  readonly status: string;
  readonly businessUnitId: string;
  readonly lines: readonly PurchaseLineRecord[];
}

/** Row shape for the Purchases screen's list — one row per purchase, no lines. */
export interface PurchaseListRow {
  readonly id: string;
  readonly docNo: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly purchaseDate: string;
  readonly paymentMode: PurchasePaymentMode;
  readonly totalAmountPaisa: number;
  readonly status: string;
}

export interface PurchaseRepositoryPort {
  /**
   * Inserts purchase + purchase_line + stock_movement (+ party_ledger for
   * credit only) + audit_log + sync_outbox in one transaction. Resolves
   * business_unit_id from business_unit WHERE code = 'PARTS' at call
   * time — never hardcoded. Overwrites item.last_purchase_cost and
   * item.avg_cost to the incoming per-stock-unit cost on every line
   * (avg_cost is NOT a true weighted average this phase — see
   * docs/phases/PHASE_2.md).
   */
  createPurchase(input: NewPurchaseInput): Promise<NewPurchaseResult>;
  getPurchaseById(id: string): Promise<PurchaseRecord | null>;
  /**
   * Reverses a confirmed purchase: posts reversing stock_movement rows
   * (and, for a credit purchase, a reversing party_ledger row) bringing
   * net stock and net balance back to their pre-purchase levels. Never
   * deletes or updates the original rows' substantive columns. Sets
   * purchase.status = 'cancelled'.
   */
  cancelPurchase(id: string): Promise<void>;
  /**
   * Read-only, most-recent-first list for the Purchases screen (P4.5-5
   * correction 2 — BUG-16's real-list fix, PROJECT.md). Includes
   * cancelled purchases (status carries that, never excludes them) — the
   * screen still needs to show them, just without a Cancel action.
   */
  listPurchases(limit: number): Promise<readonly PurchaseListRow[]>;
}
