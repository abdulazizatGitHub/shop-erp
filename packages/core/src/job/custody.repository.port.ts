/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P6-7 scope: custody reconciliation (ADR-0006). Shortage is recorded
 * for a conversation, NEVER auto-deducted from wages — no party_ledger
 * entry is ever created from this flow.
 */
export interface RecordCustodyReconciliationInput {
  readonly warehouseId: string;
  readonly custodianPartyId: string;
  readonly reconciledOn: string;
  readonly shortageValuePaisa: number;
  readonly notes: string | null;
}

export interface CustodyReconciliationResult {
  readonly id: string;
  readonly warehouseId: string;
  readonly custodianPartyId: string;
  readonly reconciledOn: string;
  readonly shortageValuePaisa: number;
  readonly actionTaken: string;
}

export interface CustodyRepositoryPort {
  /**
   * INSERT custody_reconciliation (action_taken='noted', ledger_entry_id
   * = null, always) + audit_log, one transaction. NEVER inserts a
   * party_ledger row — deduction requires a separate, explicit owner
   * action outside this flow (ADR-0006). Write path — must be wrapped in
   * withRetry (PROJECT.md BUG-15).
   */
  recordCustodyReconciliation(
    input: RecordCustodyReconciliationInput,
  ): Promise<CustodyReconciliationResult>;
}
