import type { CommissionMode } from '../job/service-charge.repository.port.js';

/**
 * Phase 16, P16-3a (docs/phases/PHASE_16.md §2a OD-16-1/OD-16-2,
 * ADR-0015). Pure — no DB, no Electron, no React (packages/core's own
 * rule). Called from job-delivery.repository.ts exactly as
 * computeLineTotalPaisa already is: a `packages/core` pure function
 * imported by `packages/db`, never a service invoked from a repository.
 *
 * Retires nothing here — Phase 7's computeCommission
 * (packages/core/src/payroll/commission.service.ts) and its
 * party.commission_bp read path stay untouched until P16-3b actually
 * wires the delivery hook and the approve/reject/reverse services
 * (Checkpoint 2). This file only adds the new calculation, standalone.
 *
 * `none` -> no claim at all, expressed as `null`, not a zero-amount
 * claim — OD-16-2: "Charges with mode = none create no claim."
 *
 * `fixed`: FLOOR(commissionAmountPaisa * quantityMilli / 1000) — the
 * quantity-milli case (2000 -> doubles the fixed amount) is a pure-
 * function-only scenario today, since job-delivery.repository.ts always
 * uses quantityMilli = 1000 for labour lines; kept as a real parameter
 * so the function is correct independent of that current caller detail.
 *
 * `bp`: FLOOR(chargedAmountPaisa * commissionBp / 10000) — basis points
 * of the labour line's CHARGED amount (post operator-override at
 * delivery, pre invoice-level discount — OD-16-1), truncated, never
 * rounded (a "0.5 paisa" remainder has no meaning).
 */
export function computeSuggestedCommissionPaisa(
  mode: CommissionMode,
  commissionAmountPaisa: number | null,
  commissionBp: number | null,
  chargedAmountPaisa: number,
  quantityMilli: number,
): number | null {
  if (mode === 'none') return null;

  if (mode === 'fixed') {
    if (commissionAmountPaisa === null) {
      throw new Error('commissionMode "fixed" requires a non-null commissionAmountPaisa');
    }
    return Math.floor((commissionAmountPaisa * quantityMilli) / 1000);
  }

  // mode === 'bp'
  if (commissionBp === null) {
    throw new Error('commissionMode "bp" requires a non-null commissionBp');
  }
  return Math.floor((chargedAmountPaisa * commissionBp) / 10000);
}

export interface TechnicianAssignmentForSuggestion {
  readonly technicianPartyId: string;
  readonly assignedAt: string;
  readonly unassignedAt: string | null;
}

/**
 * OD-16-2's "suggested recipient" — the earliest-assigned technician
 * still active on the job at delivery time, or null if none is (the
 * claim is still created either way; the owner picks a recipient
 * manually at approval when this is null). Deliberately NOT
 * job.assignedTo (P14-1's "set once, first technician ever assigned"
 * column) — a technician who was assigned first but later removed must
 * not be suggested over one who is actually still on the job.
 */
export function suggestCommissionRecipient(
  assignments: readonly TechnicianAssignmentForSuggestion[],
): string | null {
  const active = assignments.filter((a) => a.unassignedAt === null);
  if (active.length === 0) return null;

  const [earliest] = [...active].sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
  return earliest ? earliest.technicianPartyId : null;
}
