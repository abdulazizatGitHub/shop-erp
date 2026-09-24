import type { CommissionMode } from '../job/service-charge.repository.port.js';

/**
 * Hoisted from packages/db/src/repositories/service-charge.repository.ts's
 * former private copy (Checkpoint 2) — the delivery-hook claim
 * computation needs the exact same derivation, and packages/db is not
 * allowed to own business logic (CLAUDE.md §3.7). Mode is never stored
 * on service_charge itself — see service-charge.repository.port.ts's
 * ServiceChargeRecord doc comment.
 */
export function deriveCommissionMode(
  commissionAmountPaisa: number | null,
  commissionBp: number | null,
): CommissionMode {
  if (commissionAmountPaisa !== null) return 'fixed';
  if (commissionBp !== null) return 'bp';
  return 'none';
}

/**
 * Phase 16, P16-3a (docs/phases/PHASE_16.md §2a OD-16-1/OD-16-2,
 * ADR-0015). Pure — no DB, no Electron, no React (packages/core's own
 * rule). Called from job-delivery.repository.ts exactly as
 * computeLineTotalPaisa already is: a `packages/core` pure function
 * imported by `packages/db`, never a service invoked from a repository.
 *
 * Phase 7's computeCommission (formerly
 * packages/core/src/payroll/commission.service.ts) is retired and
 * deleted as of Checkpoint 2 — this function replaces it. The
 * party.commission_bp column itself stays (never edit an applied
 * migration); it is simply never read by any code path any more.
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
  readonly id: string;
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
 *
 * assignedAt is compared as a plain string, not via localeCompare —
 * these are ISO-8601 timestamps, and localeCompare's locale-sensitive
 * collation is the wrong tool for an exact machine-generated format.
 * Ties (two technicians assigned in the same millisecond) break on the
 * job_technician row's own id, a UUIDv7 and therefore time-ordered —
 * the smaller id was inserted first.
 */
export function suggestCommissionRecipient(
  assignments: readonly TechnicianAssignmentForSuggestion[],
): string | null {
  const active = assignments.filter((a) => a.unassignedAt === null);
  if (active.length === 0) return null;

  const [earliest] = [...active].sort((a, b) => {
    if (a.assignedAt < b.assignedAt) return -1;
    if (a.assignedAt > b.assignedAt) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return earliest ? earliest.technicianPartyId : null;
}
