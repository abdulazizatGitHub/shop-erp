import { z } from 'zod';

/**
 * Split out of job.ts (P15-3) to keep that file under the project's
 * 300-line convention — no behaviour change, same schemas. Parts issued
 * from stock to a technician's custody, or from a technician's custody
 * into a specific job (ADR-0005 — internal consumption vs. a counter sale).
 */
export const IssuePartsToTechnicianInput = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int().positive(),
  fromWarehouseId: z.string().uuid().nullable(),
  technicianPartyId: z.string().uuid(),
});
export type IssuePartsToTechnicianInput = z.infer<typeof IssuePartsToTechnicianInput>;

export const IssuePartsToTechnicianResult = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
});
export type IssuePartsToTechnicianResult = z.infer<typeof IssuePartsToTechnicianResult>;

export const IssuePartsToJobInput = z.object({
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantityMilli: z.number().int().positive(),
  technicianPartyId: z.string().uuid(),
  unitPricePaisa: z.number().int().nonnegative().nullable(),
  isBillable: z.boolean().default(true),
});
export type IssuePartsToJobInput = z.infer<typeof IssuePartsToJobInput>;

export const IssuePartsToJobResult = z.object({
  jobPartId: z.string().uuid(),
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantityMilli: z.number().int(),
  unitCostPaisa: z.number().int(),
  unitPricePaisa: z.number().int(),
  businessUnitId: z.string().uuid(),
});
export type IssuePartsToJobResult = z.infer<typeof IssuePartsToJobResult>;
