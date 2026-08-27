import { z } from 'zod';

/**
 * Customer payments only (P3-3 scope). `direction` is NOT an input
 * field — the repository always sets it to 'in' for this call; a
 * caller-supplied direction would let the renderer post a supplier
 * payment through the wrong door.
 */
export const CreatePaymentInput = z.object({
  partyId: z.string().uuid(),
  amountPaisa: z.number().int().min(1),
  method: z.enum(['cash', 'bank', 'easypaisa', 'jazzcash', 'cheque']),
  paymentDate: z.string().min(1),
  referenceNo: z.string().trim().min(1).nullable(),
  notes: z.string().trim().min(1).nullable(),
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentInput>;

export const PaymentDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  partyId: z.string().uuid(),
  amountPaisa: z.number().int(),
  direction: z.enum(['in', 'out']),
  method: z.string(),
  paymentDate: z.string(),
});
export type PaymentDto = z.infer<typeof PaymentDto>;
