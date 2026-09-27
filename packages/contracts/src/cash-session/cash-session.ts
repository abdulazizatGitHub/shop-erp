import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PHASE_7.md §5 Correction 2 / GAP-8 — expected_cash/difference are
 * computed and stored at close time, never recomputed at display time.
 * date/sessionId are always server-resolved for `today`/`open` calls —
 * the client never sends the date for cashSession:today (P7-5 STEP E).
 */
export const OpenSessionInput = z.object({
  date: z.string().regex(DATE_REGEX),
  openingCash: z.number().int().nonnegative(),
});
export type OpenSessionInput = z.infer<typeof OpenSessionInput>;

export const CloseSessionInput = z.object({
  sessionId: z.string().uuid(),
  countedCash: z.number().int().nonnegative(),
});
export type CloseSessionInput = z.infer<typeof CloseSessionInput>;

// Phase 17.5 (docs/phases/PHASE_17_5.md), review round 7. The refusal
// message shown when a cash movement can no longer be reversed
// ("Add a note to the closed session instead") points here — this is
// that recourse. Note text only; no direction/amount, since it does not
// change expected_cash (already computed and stored at close time).
export const SetCashSessionNoteInput = z.object({
  sessionId: z.string().uuid(),
  note: z.string().trim().min(1, 'A note is required.'),
});
export type SetCashSessionNoteInput = z.infer<typeof SetCashSessionNoteInput>;

export const CashSessionDto = z.object({
  id: z.string().uuid(),
  sessionDate: z.string(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  openingCash: z.number().int(),
  expectedCash: z.number().int().nullable(),
  countedCash: z.number().int().nullable(),
  difference: z.number().int().nullable(),
  status: z.enum(['open', 'closed']),
  notes: z.string().nullable(),
});
export type CashSessionDto = z.infer<typeof CashSessionDto>;
