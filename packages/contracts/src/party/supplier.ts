import { z } from 'zod';

/**
 * PG-A supplier CRUD minimum field set. Unlike CreateCustomerInput, phone
 * is required — matches NewSupplierInput's port type
 * (packages/core/src/party/party.repository.port.ts).
 */
export const CreateSupplierInput = z.object({
  partyCode: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1),
  shopName: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1),
  cityArea: z.string().trim().min(1).nullable(),
  paymentTerms: z.string().trim().min(1).nullable(),
  notes: z.string().trim().min(1).nullable(),
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierInput>;

export const SupplierSearchInput = z.object({
  query: z.string().trim().default(''),
});
export type SupplierSearchInput = z.infer<typeof SupplierSearchInput>;

export const SupplierIdInput = z.object({
  id: z.string().uuid(),
});
export type SupplierIdInput = z.infer<typeof SupplierIdInput>;

export const SupplierDto = z.object({
  id: z.string().uuid(),
  partyCode: z.string(),
  name: z.string(),
  shopName: z.string().nullable(),
  phone: z.string().nullable(),
  cityArea: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  notes: z.string().nullable(),
});
export type SupplierDto = z.infer<typeof SupplierDto>;

/**
 * Mirrors packages/core/src/party/party.repository.port.ts's
 * SupplierBalance — no partyCode, since v_party_balance doesn't carry it
 * (see PG-A session notes).
 */
export const SupplierBalanceDto = z.object({
  supplierId: z.string().uuid(),
  name: z.string(),
  balancePaisa: z.number().int(),
});
export type SupplierBalanceDto = z.infer<typeof SupplierBalanceDto>;
