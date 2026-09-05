/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P6-5 scope: the job delivery invoice (Flow 4). See
 * docs/phases/PHASE_6.md §8 for the agreed transaction shape.
 */
export interface DeliverJobPartLineInput {
  readonly jobPartId: string;
  /** What the payer is charged, per unit — unit_cost is always the job_part snapshot instead. */
  readonly unitPricePaisa: number;
  readonly payerPartyId: string | null;
  readonly revenueType: string;
}

export interface DeliverJobLabourLineInput {
  readonly serviceChargeId: string;
  /** null = use service_charge.retail_charge. */
  readonly unitPricePaisa: number | null;
  readonly payerPartyId: string | null;
  readonly revenueType: string;
}

export interface DeliverJobInput {
  readonly jobId: string;
  readonly saleDate: string;
  readonly partLines: readonly DeliverJobPartLineInput[];
  readonly labourLines: readonly DeliverJobLabourLineInput[];
  readonly paidPaisa: number;
}

export interface DeliverJobResult {
  readonly id: string;
  readonly docNo: string;
  readonly totalAmountPaisa: number;
}

export interface JobDeliveryRepositoryPort {
  /**
   * INSERT sale + sale_line per line + party_ledger per distinct payer
   * with an outstanding balance + UPDATE job.saleId (job is not
   * append-only) + INSERT job_status_history (to_status='delivered') +
   * audit_log + sync_outbox, one transaction. Does NOT create a
   * stock_movement for job-sourced part lines (P6-4's job_issue movement
   * is the real, final stock event — a second one would double-deduct)
   * and NEVER creates an internal_transfer (ADR-0005). Write path — must
   * be wrapped in withRetry (PROJECT.md BUG-15).
   */
  deliverJob(input: DeliverJobInput): Promise<DeliverJobResult>;
}
