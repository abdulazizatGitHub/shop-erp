import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Phase 17.5 (docs/phases/PHASE_17_5.md), ADR-0016. */
export const CashMovementType = z.enum(['bank_deposit', 'owner_draw', 'float_add', 'other']);
export type CashMovementType = z.infer<typeof CashMovementType>;

/**
 * `movementDate` is never client-supplied — resolved server-side from
 * whichever session is currently open (review round 3 R6; matches
 * `OpenSessionInput`'s own precedent of server-resolving dates the
 * client must never choose). `note` is required (non-blank) on every
 * movement, all four types (review round 2 R4).
 */
export const RecordCashMovementInput = z.object({
  movementType: CashMovementType,
  amountPaisa: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Amount cannot be zero.'),
  note: z.string().trim().min(1, 'A note is required for every cash movement.'),
});
export type RecordCashMovementInput = z.infer<typeof RecordCashMovementInput>;

export const ReverseCashMovementInput = z.object({
  originalId: z.string().uuid(),
  note: z.string().trim().min(1, 'A note is required for every cash movement.'),
});
export type ReverseCashMovementInput = z.infer<typeof ReverseCashMovementInput>;

export const ListCashMovementsInput = z.object({
  dateFrom: z.string().regex(DATE_REGEX),
  dateTo: z.string().regex(DATE_REGEX),
});
export type ListCashMovementsInput = z.infer<typeof ListCashMovementsInput>;

export const CashMovementDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  movementDate: z.string(),
  movementType: CashMovementType,
  amountPaisa: z.number().int(),
  note: z.string(),
  /** Set only on a reversal row, pointing back at the original it corrects. Null for an original (non-reversal) movement. */
  reversesId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type CashMovementDto = z.infer<typeof CashMovementDto>;
