import { z } from 'zod';

/**
 * Split out of job.ts (P15-3) to keep that file under the project's
 * 300-line convention — no behaviour change, same schemas. P6-5 — a job
 * delivery raises one invoice (sale), with payer/revenue-type set per
 * line (ADR-0007), not job-level.
 */
export const RevenueType = z.enum(['customer_paid', 'contract', 'warranty', 'internal']);
export type RevenueType = z.infer<typeof RevenueType>;

export const DeliverJobPartLineInput = z.object({
  jobPartId: z.string().uuid(),
  unitPricePaisa: z.number().int().nonnegative(),
  payerPartyId: z.string().uuid().nullable(),
  revenueType: RevenueType,
});
export type DeliverJobPartLineInput = z.infer<typeof DeliverJobPartLineInput>;

export const DeliverJobLabourLineInput = z.object({
  serviceChargeId: z.string().uuid(),
  unitPricePaisa: z.number().int().nonnegative().nullable(),
  payerPartyId: z.string().uuid().nullable(),
  revenueType: RevenueType,
});
export type DeliverJobLabourLineInput = z.infer<typeof DeliverJobLabourLineInput>;

export const DeliverJobInput = z
  .object({
    jobId: z.string().uuid(),
    saleDate: z.string().min(1),
    partLines: z.array(DeliverJobPartLineInput),
    labourLines: z.array(DeliverJobLabourLineInput),
    paidPaisa: z.number().int().nonnegative(),
  })
  .refine((data) => data.partLines.length + data.labourLines.length > 0, {
    message: 'A delivery must have at least one line',
    path: ['partLines'],
  });
export type DeliverJobInput = z.infer<typeof DeliverJobInput>;

export const DeliverJobResult = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  totalAmountPaisa: z.number().int(),
});
export type DeliverJobResult = z.infer<typeof DeliverJobResult>;
