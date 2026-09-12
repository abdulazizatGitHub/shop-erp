/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See
 * packages/core/src/purchase/purchase.repository.port.ts for the
 * precedent this file follows.
 *
 * Phase 9 scope: record what was ordered, from whom, in what quantities.
 * No prices. No stock movement. No party_ledger entry — those only
 * happen when a grn is confirmed against this purchase order (see
 * ../grn/grn.repository.port.ts).
 */
export type PurchaseOrderStatus =
  'draft' | 'sent' | 'partially_received' | 'fully_received' | 'cancelled';

export interface NewPurchaseOrderLineInput {
  readonly itemId: string;
  /** milli-units, > 0. */
  readonly quantityOrderedMilli: number;
  readonly notes: string | null;
}

export interface NewPurchaseOrderInput {
  /** Either this or supplierNote (or both) should be present — enforced at the IPC/Zod boundary, not here. */
  readonly supplierPartyId: string | null;
  readonly supplierNote: string | null;
  /** ISO date, e.g. "2026-09-12". */
  readonly orderDate: string;
  readonly expectedDelivery: string | null;
  readonly notes: string | null;
  readonly lines: readonly NewPurchaseOrderLineInput[];
}

export interface NewPurchaseOrderResult {
  readonly id: string;
  readonly docNo: string;
}

export interface PurchaseOrderLineRecord {
  readonly id: string;
  readonly itemId: string;
  readonly quantityOrderedMilli: number;
  readonly quantityReceivedMilli: number;
  readonly notes: string | null;
}

export interface PurchaseOrderRecord {
  readonly id: string;
  readonly docNo: string;
  readonly supplierPartyId: string | null;
  readonly supplierNote: string | null;
  readonly orderDate: string;
  readonly expectedDelivery: string | null;
  readonly notes: string | null;
  readonly status: PurchaseOrderStatus;
  readonly lines: readonly PurchaseOrderLineRecord[];
}

/** Row shape for a purchase-order list — one row per PO, no lines. */
export interface PurchaseOrderSummary {
  readonly id: string;
  readonly docNo: string;
  readonly supplierName: string | null;
  readonly orderDate: string;
  readonly status: PurchaseOrderStatus;
  readonly lineCount: number;
  readonly totalOrderedMilli: number;
  readonly totalReceivedMilli: number;
}

export interface PurchaseOrderRepositoryPort {
  /**
   * Inserts purchase_order + purchase_order_line rows in one transaction.
   * Assigns doc_no via document_sequence (doc_type='purchase_order',
   * prefix='PO'), keyed by this repository instance's deviceCode, same
   * pattern as KyselyPurchaseRepository. status starts 'draft'. No stock
   * movement, no party_ledger entry.
   */
  create(input: NewPurchaseOrderInput): Promise<NewPurchaseOrderResult>;
  get(id: string): Promise<PurchaseOrderRecord | null>;
  /** Newest first. Excludes cancelled purchase orders. */
  list(): Promise<readonly PurchaseOrderSummary[]>;
  /** Internal — called by the grn repository after a GRN is confirmed or cancelled. */
  updateStatus(id: string, status: PurchaseOrderStatus): Promise<void>;
  /**
   * Only allowed if no confirmed grn exists against this purchase order —
   * throws PurchaseOrderHasGrnsError otherwise. Throws
   * PurchaseOrderNotFoundError / PurchaseOrderAlreadyCancelledError as
   * appropriate. Sets status='cancelled'. No stock or ledger impact.
   */
  cancel(id: string): Promise<void>;
}
