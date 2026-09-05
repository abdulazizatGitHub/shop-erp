/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P6-3/P6-4 scope: parts issue Shop -> Technician (custody transfer) and
 * Technician -> Job (real consumption). See docs/phases/PHASE_6.md §4
 * Flows 2/3 and ADR-0006 (custody is a warehouse, not a debt).
 */
export interface IssuePartsToTechnicianInput {
  readonly itemId: string;
  readonly quantityMilli: number;
  /** null = the tenant's default (Shop) warehouse. */
  readonly fromWarehouseId: string | null;
  readonly technicianPartyId: string;
}

export interface IssuePartsToTechnicianResult {
  readonly itemId: string;
  readonly quantityMilli: number;
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
}

export interface IssuePartsToJobInput {
  readonly jobId: string;
  readonly itemId: string;
  readonly quantityMilli: number;
  readonly technicianPartyId: string;
  /** null = resolve via the default (Retail) price, same as a sale line with no override. */
  readonly unitPricePaisa: number | null;
  readonly isBillable: boolean;
}

export interface IssuePartsToJobResult {
  readonly jobPartId: string;
  readonly jobId: string;
  readonly itemId: string;
  readonly quantityMilli: number;
  readonly unitCostPaisa: number;
  readonly unitPricePaisa: number;
  readonly businessUnitId: string;
}

export interface JobPartRecord {
  readonly id: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantityMilli: number;
  readonly unitCostPaisa: number;
  readonly unitPricePaisa: number;
  /** 'issue' | 'return' — the UI nets these client-side; no aggregation happens in SQL. */
  readonly entryType: string;
  readonly reversesJobPartId: string | null;
  readonly isBillable: boolean;
  readonly issuedAt: string;
}

export interface JobIssueRepositoryPort {
  /**
   * Shop -> Technician custody transfer. Posts stock_movement
   * 'transfer_out' (negative, Shop) + 'transfer_in' (positive,
   * technician's warehouse) + audit_log, one transaction. NOT a sale,
   * NOT a job_issue — this is custody, not consumption (ADR-0005/0006).
   * If the technician has no warehouse yet, one is lazily created
   * (warehouse_kind='technician') — matches this codebase's existing
   * lazy-creation precedent (document_sequence rows in
   * sale.repository.ts's nextSaleDocNo). Write path — must be wrapped
   * in withRetry (PROJECT.md BUG-15).
   */
  issuePartsToTechnician(input: IssuePartsToTechnicianInput): Promise<IssuePartsToTechnicianResult>;
  /**
   * Technician -> Job: real, final consumption (ADR-0005 — "physical
   * stock still moves Shop -> technician -> job; that movement IS
   * custody, not a sale"; job_issue here is the final leg). Posts
   * job_part (entry_type='issue', INSERT-only, GAP-8) + stock_movement
   * (movement_type='job_issue', negative, FROM the technician's
   * warehouse) + audit_log, one transaction. NEVER 'sale' — must not
   * appear in v_daily_sales (satisfied by construction: v_daily_sales
   * reads from `sale`, and this never writes one). Write path — must be
   * wrapped in withRetry (PROJECT.md BUG-15).
   */
  issuePartsToJob(input: IssuePartsToJobInput): Promise<IssuePartsToJobResult>;
  /**
   * Plain filtered SELECT, oldest first — every job_part row for this
   * job, issue AND return, entry_type included. No business logic, no
   * netting: the caller (JobDeliveryModal/IssuedPartsPanel) computes the
   * net remaining quantity per item client-side.
   */
  listJobParts(jobId: string): Promise<readonly JobPartRecord[]>;
}
