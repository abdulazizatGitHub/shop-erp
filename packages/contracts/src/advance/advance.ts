import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PHASE_7.md §5 GAP-4 — advance/peshgi. amountPaisa is always positive
 * (party_ledger.amount is signed on write, +ve = staff owes the shop,
 * per GAP-4's confirmed convention — never negative on this input).
 * tenantId is deliberately NOT a field here — same reasoning as
 * SaveAttendanceInput (P7-1): every write handler takes tenantId from
 * server-side deps, never from the renderer.
 */
export const RecordAdvanceInput = z.object({
  staffId: z.string().uuid(),
  date: z.string().regex(DATE_REGEX),
  amountPaisa: z.number().int().positive(),
  notes: z.string().optional(),
});
export type RecordAdvanceInput = z.infer<typeof RecordAdvanceInput>;

export const AdvanceDto = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  staffName: z.string(),
  date: z.string(),
  amountPaisa: z.number().int(),
  docNo: z.string(),
  notes: z.string().nullable(),
});
export type AdvanceDto = z.infer<typeof AdvanceDto>;

export const ListAdvancesInput = z.object({
  staffId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});
export type ListAdvancesInput = z.infer<typeof ListAdvancesInput>;
