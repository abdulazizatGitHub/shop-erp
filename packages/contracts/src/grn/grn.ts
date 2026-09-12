import { z } from 'zod';

/**
 * Phase 9. Mirrors packages/core/src/grn/grn.repository.port.ts exactly.
 * See ../purchase-order/purchase-order.ts's header for why `.nullable()`
 * is used instead of the phase brief's own draft `.optional()`.
 */
export const GrnLineInput = z.object({
  /** null = unplanned receipt, an item not on the original purchase order. */
  purchaseOrderLineId: z.string().uuid().nullable(),
  itemId: z.string().uuid(),
  quantityReceivedMilli: z.number().int().positive(),
  unitCostPaisa: z.number().int().positive(),
  sellingPricePaisa: z.number().int().positive(),
  wholesalePricePaisa: z.number().int().positive().nullable(),
});
export type GrnLineInput = z.infer<typeof GrnLineInput>;

export const CreateGrnInput = z.object({
  purchaseOrderId: z.string().uuid(),
  /** Overrides the PO's supplier for this receipt when set. */
  supplierPartyId: z.string().uuid().nullable(),
  supplierBillRef: z.string().trim().min(1).max(100).nullable(),
  grnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMode: z.enum(['cash', 'credit']),
  notes: z.string().trim().min(1).max(500).nullable(),
  lines: z.array(GrnLineInput).min(1),
});
export type CreateGrnInput = z.infer<typeof CreateGrnInput>;

export const GrnIdInput = z.object({
  id: z.string().uuid(),
});
export type GrnIdInput = z.infer<typeof GrnIdInput>;

export const GrnListForPurchaseOrderInput = z.object({
  purchaseOrderId: z.string().uuid(),
});
export type GrnListForPurchaseOrderInput = z.infer<typeof GrnListForPurchaseOrderInput>;

export const GrnPaymentMode = z.enum(['cash', 'credit']);
export type GrnPaymentMode = z.infer<typeof GrnPaymentMode>;

export const GrnStatus = z.enum(['confirmed', 'cancelled']);
export type GrnStatus = z.infer<typeof GrnStatus>;

/** Mirrors GrnLineRecord exactly. */
export const GrnLineDto = z.object({
  id: z.string().uuid(),
  purchaseOrderLineId: z.string().uuid().nullable(),
  itemId: z.string().uuid(),
  quantityReceivedMilli: z.number().int(),
  unitCostPaisa: z.number().int(),
  sellingPricePaisa: z.number().int(),
  wholesalePricePaisa: z.number().int().nullable(),
});
export type GrnLineDto = z.infer<typeof GrnLineDto>;

/** Mirrors GrnRecord exactly. */
export const GrnDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  purchaseOrderId: z.string().uuid(),
  supplierPartyId: z.string().uuid().nullable(),
  supplierBillRef: z.string().nullable(),
  grnDate: z.string(),
  paymentMode: GrnPaymentMode,
  status: GrnStatus,
  notes: z.string().nullable(),
  lines: z.array(GrnLineDto),
});
export type GrnDto = z.infer<typeof GrnDto>;

/** Mirrors GrnSummary exactly — the "GRNs against this PO" list row. */
export const GrnSummaryDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  grnDate: z.string(),
  paymentMode: GrnPaymentMode,
  status: GrnStatus,
  lineCount: z.number().int(),
  totalReceivedMilli: z.number().int(),
});
export type GrnSummaryDto = z.infer<typeof GrnSummaryDto>;
