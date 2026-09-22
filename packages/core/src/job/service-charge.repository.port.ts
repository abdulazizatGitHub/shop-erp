/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Phase 16, P16-1 (docs/phases/PHASE_16.md §2a OD-16-1).
 */
export type CommissionMode = 'none' | 'fixed' | 'bp';

interface ServiceChargeFields {
  readonly name: string;
  readonly jobType: string | null;
  readonly retailChargePaisa: number;
  readonly wholesaleChargePaisa: number | null;
  readonly commissionAmountPaisa: number | null;
  readonly commissionBp: number | null;
  readonly typicalMinutes: number | null;
  readonly notes: string | null;
}

export type NewServiceChargeInput = ServiceChargeFields;

export interface UpdateServiceChargeFields extends ServiceChargeFields {
  readonly id: string;
}

/**
 * commissionMode is derived, not stored — see kysely-schema.ts's
 * ServiceChargeTable (no commission_mode column). Every implementation
 * derives it the same way: commissionAmountPaisa set -> 'fixed',
 * commissionBp set -> 'bp', neither set -> 'none' (mutually exclusive,
 * enforced at both the Zod boundary and by
 * service-charge.service.ts's assertCommissionModeConsistent).
 */
export interface ServiceChargeRecord extends ServiceChargeFields {
  readonly id: string;
  readonly commissionMode: CommissionMode;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface ServiceChargeRepositoryPort {
  /** Rejects a case-insensitive duplicate name for this tenant (including inactive charges — no delete exists, per P16-1's "no delete"). */
  createServiceCharge(input: NewServiceChargeInput): Promise<ServiceChargeRecord>;
  /** Never touches sale_line — delivered labour lines snapshot name/price at delivery time (SQ-6 finding), so an edit here never rewrites a past invoice. */
  updateServiceCharge(input: UpdateServiceChargeFields): Promise<ServiceChargeRecord>;
  toggleServiceCharge(id: string, isActive: boolean): Promise<ServiceChargeRecord>;
  /** Active AND inactive — the Job Settings admin list. lookup.repository.ts's listServiceCharges (active-only) stays the delivery-modal dropdown source, unchanged. */
  listServiceChargesAdmin(): Promise<readonly ServiceChargeRecord[]>;
}
