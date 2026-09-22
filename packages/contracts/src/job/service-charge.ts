import { z } from 'zod';

/**
 * Phase 16, P16-1. Commission mode is not a stored column — DB storage
 * derives it from commission_amount/commission_bp being set or NULL
 * (OD-16-1, docs/phases/PHASE_16.md §2a). This input schema takes mode
 * explicitly so a caller states its intent, then requires the paired
 * field(s) to match it.
 */
export const CommissionMode = z.enum(['none', 'fixed', 'bp']);
export type CommissionMode = z.infer<typeof CommissionMode>;

interface CommissionModeCandidate {
  readonly commissionMode: CommissionMode;
  readonly commissionAmountPaisa?: number | null | undefined;
  readonly commissionBp?: number | null | undefined;
}

/**
 * Zod-boundary half of the "Zod + core" double validation
 * (docs/phases/PHASE_16.md §4 P16-1 exit criteria). The other half is
 * packages/core/src/job/service-charge.service.ts's
 * assertCommissionModeConsistent — a caller invoking the core service
 * directly (bypassing this file, as a core-layer test does) must not be
 * able to skip the invariant just because it skipped Zod.
 */
function checkCommissionMode(data: CommissionModeCandidate, ctx: z.RefinementCtx): void {
  const amountPaisa = data.commissionAmountPaisa ?? null;
  const bp = data.commissionBp ?? null;

  if (data.commissionMode === 'none') {
    if (amountPaisa !== null || bp !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'commissionMode "none" requires commissionAmountPaisa and commissionBp to both be null',
        path: ['commissionMode'],
      });
    }
    return;
  }

  if (data.commissionMode === 'fixed') {
    if (amountPaisa === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'commissionMode "fixed" requires a positive commissionAmountPaisa',
        path: ['commissionAmountPaisa'],
      });
    }
    if (bp !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'commissionMode "fixed" requires commissionBp to be null',
        path: ['commissionBp'],
      });
    }
    return;
  }

  // commissionMode === 'bp'
  if (bp === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'commissionMode "bp" requires commissionBp between 1 and 10000',
      path: ['commissionBp'],
    });
  }
  if (amountPaisa !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'commissionMode "bp" requires commissionAmountPaisa to be null',
      path: ['commissionAmountPaisa'],
    });
  }
}

const serviceChargeShape = {
  name: z.string().trim().min(1).max(200),
  jobType: z.string().trim().min(1).max(100).nullable().optional(),
  retailChargePaisa: z.number().int().positive(),
  wholesaleChargePaisa: z.number().int().positive().nullable().optional(),
  typicalMinutes: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  commissionMode: CommissionMode,
  commissionAmountPaisa: z.number().int().positive().nullable().optional(),
  commissionBp: z.number().int().min(1).max(10000).nullable().optional(),
};

export const CreateServiceChargeInput = z
  .object(serviceChargeShape)
  .superRefine(checkCommissionMode);
export type CreateServiceChargeInput = z.infer<typeof CreateServiceChargeInput>;

export const UpdateServiceChargeInput = z
  .object({ id: z.string().uuid(), ...serviceChargeShape })
  .superRefine(checkCommissionMode);
export type UpdateServiceChargeInput = z.infer<typeof UpdateServiceChargeInput>;

export const ToggleServiceChargeInput = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});
export type ToggleServiceChargeInput = z.infer<typeof ToggleServiceChargeInput>;

/** Admin list/detail row — active AND inactive, unlike lookup.repository.ts's listServiceCharges (delivery dropdown, active-only). */
export const ServiceChargeAdminDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  jobType: z.string().nullable(),
  retailChargePaisa: z.number().int(),
  wholesaleChargePaisa: z.number().int().nullable(),
  commissionMode: CommissionMode,
  commissionAmountPaisa: z.number().int().nullable(),
  commissionBp: z.number().int().nullable(),
  typicalMinutes: z.number().int().nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type ServiceChargeAdminDto = z.infer<typeof ServiceChargeAdminDto>;
