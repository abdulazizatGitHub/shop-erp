import { z } from 'zod';

/**
 * P8-2 (BUG-18) — a generic "find any party by name" search, for cases
 * where the payer isn't necessarily a customer or a supplier (e.g. a
 * manufacturer paying a warranty claim, party_type='both'). Deliberately
 * separate from customer:search/party:search, which stay narrow to their
 * own screens per docs/phases/PHASE_8.md §5.
 */
export const PartySearchAnyInput = z.object({
  query: z.string().trim().default(''),
});
export type PartySearchAnyInput = z.infer<typeof PartySearchAnyInput>;

export const PartyAnyDto = z.object({
  id: z.string().uuid(),
  partyCode: z.string(),
  name: z.string(),
  shopName: z.string().nullable(),
  phone: z.string().nullable(),
  partyType: z.enum(['customer', 'supplier', 'both']),
});
export type PartyAnyDto = z.infer<typeof PartyAnyDto>;
