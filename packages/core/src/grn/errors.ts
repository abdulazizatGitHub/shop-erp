/**
 * Typed domain errors for the grn module (Phase 9). See
 * ../purchase-order/errors.ts for why these are typed classes instead of
 * the plain-Error pattern purchase.repository.ts uses.
 */

export class GrnNotFoundError extends Error {
  constructor(grnId: string) {
    super(`GRN ${grnId} not found`);
    this.name = 'GrnNotFoundError';
  }
}

export class GrnAlreadyCancelledError extends Error {
  constructor(grnId: string) {
    super(`GRN ${grnId} is already cancelled`);
    this.name = 'GrnAlreadyCancelledError';
  }
}

export class PurchaseOrderCancelledError extends Error {
  constructor(purchaseOrderId: string) {
    super(`Purchase order ${purchaseOrderId} is cancelled and cannot receive a GRN`);
    this.name = 'PurchaseOrderCancelledError';
  }
}

export class InvalidGrnLineError extends Error {
  constructor(purchaseOrderLineId: string, purchaseOrderId: string) {
    super(
      `Purchase order line ${purchaseOrderLineId} does not belong to ` +
        `purchase order ${purchaseOrderId}`,
    );
    this.name = 'InvalidGrnLineError';
  }
}

export class MissingSupplierForCreditError extends Error {
  constructor() {
    super('A credit GRN requires a supplier — none was provided on the GRN or its purchase order');
    this.name = 'MissingSupplierForCreditError';
  }
}
