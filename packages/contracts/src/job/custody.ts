import { z } from 'zod';

/**
 * Split out of job.ts (P15-3) to keep that file under the project's
 * 300-line convention — no behaviour change, same schemas. Reconciling a
 * technician's parts custody (v_technician_custody) against a physical count.
 */
export const RecordCustodyReconciliationInput = z.object({
  warehouseId: z.string().uuid(),
  custodianPartyId: z.string().uuid(),
  reconciledOn: z.string().min(1),
  shortageValuePaisa: z.number().int().nonnegative(),
  notes: z.string().trim().min(1).nullable(),
});
export type RecordCustodyReconciliationInput = z.infer<typeof RecordCustodyReconciliationInput>;

export const CustodyReconciliationResult = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  custodianPartyId: z.string().uuid(),
  reconciledOn: z.string(),
  shortageValuePaisa: z.number().int(),
  actionTaken: z.string(),
});
export type CustodyReconciliationResult = z.infer<typeof CustodyReconciliationResult>;
