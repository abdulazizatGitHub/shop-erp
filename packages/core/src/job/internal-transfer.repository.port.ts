/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P6-6 scope: internal transfer for UNBILLED consumption only (free
 * installation, warranty rework, shop's own use, sample) — ADR-0005.
 * Never called from deliverJob; the two paths are mutually exclusive.
 */
export type InternalTransferReason =
  'free_installation' | 'warranty_rework' | 'shop_own_use' | 'sample' | 'other';

export interface InternalTransferLineInput {
  readonly itemId: string;
  readonly quantityMilli: number;
}

export interface NewInternalTransferInput {
  readonly transferDate: string;
  readonly reason: InternalTransferReason;
  readonly jobId: string | null;
  readonly lines: readonly InternalTransferLineInput[];
  readonly notes: string | null;
}

export interface NewInternalTransferResult {
  readonly id: string;
  readonly docNo: string;
  readonly totalAmountPaisa: number;
}

export interface InternalTransferRepositoryPort {
  /**
   * INSERT internal_transfer (valuation_method='cost', always — GAP-5) +
   * internal_transfer_line per item (unit_value = item.avg_cost snapshot)
   * + ONE stock_movement leg (transfer_out, negative, from the Spare
   * Parts/default warehouse — Repair owns no stock, so there is no
   * second leg) + audit_log, one transaction. Write path — must be
   * wrapped in withRetry (PROJECT.md BUG-15).
   */
  createInternalTransfer(input: NewInternalTransferInput): Promise<NewInternalTransferResult>;
}
