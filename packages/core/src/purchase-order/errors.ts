/**
 * Typed domain errors for the purchase_order module (Phase 9). The
 * existing purchase.repository.ts throws plain Error strings — an
 * acknowledged CODING_STANDARDS gap never fixed for that module. Phase 9
 * does not backfill that file; new PO/GRN code uses typed classes from
 * the start instead of repeating the plain-Error pattern.
 */

export class PurchaseOrderNotFoundError extends Error {
  constructor(purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} not found`);
    this.name = 'PurchaseOrderNotFoundError';
  }
}

export class PurchaseOrderAlreadyCancelledError extends Error {
  constructor(purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} is already cancelled`);
    this.name = 'PurchaseOrderAlreadyCancelledError';
  }
}

export class PurchaseOrderHasGrnsError extends Error {
  constructor(purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} has confirmed GRNs ` + `and cannot be cancelled.`);
    this.name = 'PurchaseOrderHasGrnsError';
  }
}
