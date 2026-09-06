/**
 * PHASE_7.md §5 Conflict 3 (Decision A) — party.commission_bp is the
 * sole commission source this phase; service_charge.commission_amount/
 * commission_bp exist in the schema and are read by no Phase 7 code.
 * Pure function, no DB import.
 */
export function computeCommission(labourTotalPaisa: number, commissionBp: number): number {
  if (commissionBp <= 0) return 0;
  return Math.floor((labourTotalPaisa * commissionBp) / 10000);
}
