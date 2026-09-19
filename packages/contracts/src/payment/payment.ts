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

export const PaymentIdInput = z.object({
  paymentId: z.string().uuid(),
});
export type PaymentIdInput = z.infer<typeof PaymentIdInput>;

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

/** CL-7. payment:getReceipt / print:printPaymentReceipt. */
export const PaymentReceiptDataDto = z.object({
  docNo: z.string(),
  paymentDate: z.string(),
  amountPaisa: z.number().int(),
  method: z.string(),
  referenceNo: z.string().nullable(),
  notes: z.string().nullable(),
  customerName: z.string(),
  customerCode: z.string(),
  customerPhone: z.string().nullable(),
  shopIdentity: z.object({
    shopName: z.string(),
    shopPhone: z.string().nullable(),
    shopAddress: z.string().nullable(),
    shopEmail: z.string().nullable(),
    invoiceHeaderText: z.string().nullable(),
    invoiceFooterText: z.string().nullable(),
    statementFooterText: z.string().nullable(),
  }),
  previousBalancePaisa: z.number().int(),
  remainingBalancePaisa: z.number().int(),
});
export type PaymentReceiptDataDto = z.infer<typeof PaymentReceiptDataDto>;
