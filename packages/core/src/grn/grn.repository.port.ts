/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db.
 *
 * Phase 9 scope: record what actually arrived against a purchase order,
 * at what cost, against a supplier bill. create() is the phase's most
 * critical method — it posts stock_movement, updates item cost/price
 * fields (+ item_price_history), updates purchase_order_line running
 * totals and purchase_order.status, and (for credit) posts a
 * party_ledger row, all in one transaction. See
 * docs/phases/PHASE_9.md "Decisions" for the exact business rules this
 * implements.
 */
export type GrnPaymentMode = 'cash' | 'credit';
export type GrnStatus = 'confirmed' | 'cancelled';

export interface NewGrnLineInput {
  /** null = unplanned receipt, an item not on the original purchase order. */
  readonly purchaseOrderLineId: string | null;
  readonly itemId: string;
  /** milli-units, > 0 — what actually arrived, in stock UoM. */
  readonly quantityReceivedMilli: number;
  /** paisa, per stock unit, from the supplier bill. */
  readonly unitCostPaisa: number;
  /** paisa, per stock unit. Required. */
  readonly sellingPricePaisa: number;
  /** paisa, per stock unit. Optional. */
  readonly wholesalePricePaisa: number | null;
}

export interface NewGrnInput {
  readonly purchaseOrderId: string;
  /** Overrides the PO's supplier for this receipt when set. */
  readonly supplierPartyId: string | null;
  readonly supplierBillRef: string | null;
  /** ISO date, e.g. "2026-09-12". */
  readonly grnDate: string;
  readonly paymentMode: GrnPaymentMode;
  readonly notes: string | null;
  readonly lines: readonly NewGrnLineInput[];
}

export interface NewGrnResult {
  readonly id: string;
  readonly docNo: string;
}

export interface GrnLineRecord {
  readonly id: string;
  readonly purchaseOrderLineId: string | null;
  readonly itemId: string;
  readonly quantityReceivedMilli: number;
  readonly unitCostPaisa: number;
  readonly sellingPricePaisa: number;
  readonly wholesalePricePaisa: number | null;
}

export interface GrnRecord {
  readonly id: string;
  readonly docNo: string;
  readonly purchaseOrderId: string;
  readonly supplierPartyId: string | null;
  readonly supplierBillRef: string | null;
  readonly grnDate: string;
  readonly paymentMode: GrnPaymentMode;
  readonly status: GrnStatus;
  readonly notes: string | null;
  readonly lines: readonly GrnLineRecord[];
}

/** Row shape for the "GRNs against this PO" list — one row per GRN, no lines. */
export interface GrnSummary {
  readonly id: string;
  readonly docNo: string;
  readonly grnDate: string;
  readonly paymentMode: GrnPaymentMode;
  readonly status: GrnStatus;
  readonly lineCount: number;
  readonly totalReceivedMilli: number;
}

export interface GrnRepositoryPort {
  /**
   * ONE transaction. See docs/phases/PHASE_9.md for the exact ordered
   * business rules (a–j): validates the PO isn't cancelled, validates
   * every purchase_order_line_id belongs to this PO, validates credit
   * requires a resolvable supplier, generates doc_no, inserts grn +
   * grn_line rows, posts a stock_movement per line
   * (movementType='purchase', sourceType='grn'), updates
   * item.last_purchase_cost/avg_cost + item_price (retail/wholesale) with
   * item_price_history rows wherever a value actually changes, updates
   * purchase_order_line.quantity_received_milli for planned lines,
   * recomputes purchase_order.status, posts one party_ledger row for
   * credit, and writes audit_log + sync_outbox.
   */
  create(input: NewGrnInput): Promise<NewGrnResult>;
  get(id: string): Promise<GrnRecord | null>;
  /** Newest first. Includes cancelled GRNs (status carries that). */
  listForPurchaseOrder(purchaseOrderId: string): Promise<readonly GrnSummary[]>;
  /**
   * ONE transaction. Reverses stock_movement (and, for a credit GRN, a
   * party_ledger row), decrements purchase_order_line running totals,
   * recomputes purchase_order.status, sets grn.status='cancelled'. Does
   * NOT roll back item_price_history or item.last_purchase_cost/avg_cost —
   * price history is permanent (docs/phases/PHASE_9.md). Throws
   * GrnNotFoundError / GrnAlreadyCancelledError as appropriate.
   */
  cancel(id: string): Promise<void>;
}
