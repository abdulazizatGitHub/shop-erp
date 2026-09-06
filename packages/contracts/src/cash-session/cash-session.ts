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
});
export type CashSessionDto = z.infer<typeof CashSessionDto>;
