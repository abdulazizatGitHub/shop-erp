import { z } from 'zod';

/**
 * P3-1 minimum field set for manual customer creation. `customerType`
 * stores lowercase 'retail'/'wholesale', matching every other enum-like
 * column in the schema (party_type, movement_type, item_type, ...).
 */
export const CreateCustomerInput = z.object({
  partyCode: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1),
  shopName: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  customerType: z.enum(['retail', 'wholesale']).nullable(),
  priceLevelId: z.string().uuid().nullable(),
  creditLimitPaisa: z.number().int().nonnegative().nullable(),
  notes: z.string().trim().min(1).nullable(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;

export const CustomerSearchInput = z.object({
  query: z.string().trim().default(''),
});
export type CustomerSearchInput = z.infer<typeof CustomerSearchInput>;

export const CustomerIdInput = z.object({
  id: z.string().uuid(),
});
export type CustomerIdInput = z.infer<typeof CustomerIdInput>;

export const CustomerDto = z.object({
  id: z.string().uuid(),
  partyCode: z.string(),
  name: z.string(),
  shopName: z.string().nullable(),
  phone: z.string().nullable(),
  customerType: z.enum(['retail', 'wholesale']).nullable(),
  priceLevelId: z.string().uuid().nullable(),
  creditLimitPaisa: z.number().int().nullable(),
  notes: z.string().nullable(),
});
export type CustomerDto = z.infer<typeof CustomerDto>;

export const CustomerBalanceDto = z.object({
  customerId: z.string().uuid(),
  balancePaisa: z.number().int(),
});
export type CustomerBalanceDto = z.infer<typeof CustomerBalanceDto>;
