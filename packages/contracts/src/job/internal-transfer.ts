import { z } from 'zod';

/**
 * Split out of job.ts (P15-3) to keep that file under the project's
 * 300-line convention — no behaviour change, same schemas. Internal
 * stock transfers (free installs, warranty rework, shop's own use) not
 * tied to a counter sale.
 */
export const InternalTransferReason = z.enum([
  'free_installation',
  'warranty_rework',
  'shop_own_use',
  'sample',
  'other',
]);
export type InternalTransferReason = z.infer<typeof InternalTransferReason>;

export const InternalTransferLineInput = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int().positive(),
});
export type InternalTransferLineInput = z.infer<typeof InternalTransferLineInput>;

export const CreateInternalTransferInput = z.object({
  transferDate: z.string().min(1),
  reason: InternalTransferReason,
  jobId: z.string().uuid().nullable(),
  lines: z.array(InternalTransferLineInput).min(1),
  notes: z.string().trim().min(1).nullable(),
});
export type CreateInternalTransferInput = z.infer<typeof CreateInternalTransferInput>;

export const NewInternalTransferResult = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  totalAmountPaisa: z.number().int(),
});
export type NewInternalTransferResult = z.infer<typeof NewInternalTransferResult>;
