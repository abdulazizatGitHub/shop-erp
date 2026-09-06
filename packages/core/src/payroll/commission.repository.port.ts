/**
 * Repository interface (port) — defined here in core, implemented in db.
 * New file, not an extension of advance.repository.port.ts — commission
 * is a distinct payroll concern (docs/SYSTEM_DESIGN.md §3 groups it with
 * attendance/wages/advances under the payroll module, but it has a
 * different trigger point — post-delivery, never user-initiated — and
 * no "list" requirement), so kept as its own port rather than
 * conflating two separate write paths into one interface. Colocated in
 * packages/core/src/payroll/ alongside attendance/advance, same
 * convention as every other port this phase.
 */

export interface RecordCommissionInput {
  readonly technicianId: string;
  readonly jobId: string;
  readonly commissionPaisa: number;
  readonly deliveryDate: string;
}

export interface CommissionRepositoryPort {
  /**
   * ONE TRANSACTION: party_ledger (entry_type='commission', amount
   * NEGATIVE — shop owes the technician, PHASE_7.md §5 GAP-4's sign
   * convention applied in the opposite direction) + audit_log +
   * sync_outbox. Throws immediately, without opening a transaction, if
   * commissionPaisa <= 0 — the caller must already guard this, but the
   * repository never inserts a zero/negative commission row regardless.
   */
  recordCommission(input: RecordCommissionInput): Promise<void>;
}
