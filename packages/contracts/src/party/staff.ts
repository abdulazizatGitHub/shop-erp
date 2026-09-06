import { z } from 'zod';

/**
 * PHASE_7.md §5 GAP-9 minimum field set for manual staff creation.
 * wageRatePaisa/commissionBp are always paisa/basis-points by the time
 * they reach this schema — the UI converts Rs/day -> paisa (x100) and
 * whole-number percent -> basis points (x100) before calling
 * staff:create, so this layer never sees rupees or percent directly.
 * business_unit_id is deliberately NOT a field here — PHASE_7.md
 * Correction C derives it automatically from staffRole at
 * attendance-save time, not staff-creation time.
 */
export const StaffCreateInput = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  staffRole: z.enum(['technician', 'salesman', 'helper']),
  wageRatePaisa: z.number().int().nonnegative(),
  commissionBp: z.number().int().nonnegative().default(0),
});
export type StaffCreateInput = z.infer<typeof StaffCreateInput>;

export const StaffDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  staffRole: z.enum(['technician', 'salesman', 'helper']),
  wageRatePaisa: z.number().int(),
  commissionBp: z.number().int(),
  partyCode: z.string(),
  createdAt: z.string(),
});
export type StaffDto = z.infer<typeof StaffDto>;
