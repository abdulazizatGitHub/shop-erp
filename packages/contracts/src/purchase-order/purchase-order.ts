import { z } from 'zod';

/**
 * Phase 9. Mirrors packages/core/src/purchase-order/
 * purchase-order.repository.port.ts exactly. One deviation from the
 * phase brief's own draft: optional fields there (`.optional()`) are
 * `.nullable()` here instead, matching the port's `T | null` types and
 * the established convention in ./purchase/purchase.ts's
 * CreatePurchaseInput — a Zod schema's parsed output must structurally
 * match the port input it's handed to directly, with no adapter step.
 */
export const PurchaseOrderLineInput = z.object({
  itemId: z.string().uuid(),
  quantityOrderedMilli: z.number().int().positive(),
  notes: z.string().trim().min(1).nullable(),
});
export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineInput>;

export const CreatePurchaseOrderInput = z
  .object({
    supplierPartyId: z.string().uuid().nullable(),
    supplierNote: z.string().trim().min(1).max(200).nullable(),
    orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expectedDelivery: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    notes: z.string().trim().min(1).max(500).nullable(),
    lines: z.array(PurchaseOrderLineInput).min(1),
  })
  .refine((data) => data.supplierPartyId !== null || data.supplierNote !== null, {
    message: 'At least one of supplierPartyId or supplierNote is required',
    path: ['supplierPartyId'],
  });
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInput>;

export const PurchaseOrderIdInput = z.object({
  id: z.string().uuid(),
});
export type PurchaseOrderIdInput = z.infer<typeof PurchaseOrderIdInput>;

export const PurchaseOrderStatus = z.enum([
  'draft',
  'sent',
  'partially_received',
  'fully_received',
  'cancelled',
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;

/** Mirrors PurchaseOrderLineRecord exactly. */
export const PurchaseOrderLineDto = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  quantityOrderedMilli: z.number().int(),
  quantityReceivedMilli: z.number().int(),
  notes: z.string().nullable(),
});
export type PurchaseOrderLineDto = z.infer<typeof PurchaseOrderLineDto>;

/** Mirrors PurchaseOrderRecord exactly. */
export const PurchaseOrderDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  supplierPartyId: z.string().uuid().nullable(),
  supplierNote: z.string().nullable(),
  orderDate: z.string(),
  expectedDelivery: z.string().nullable(),
  notes: z.string().nullable(),
  status: PurchaseOrderStatus,
  lines: z.array(PurchaseOrderLineDto),
});
export type PurchaseOrderDto = z.infer<typeof PurchaseOrderDto>;

/** Mirrors PurchaseOrderSummary exactly — the Purchase Orders screen's list row. */
export const PurchaseOrderSummaryDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  supplierName: z.string().nullable(),
  orderDate: z.string(),
  status: PurchaseOrderStatus,
  lineCount: z.number().int(),
  totalOrderedMilli: z.number().int(),
  totalReceivedMilli: z.number().int(),
});
export type PurchaseOrderSummaryDto = z.infer<typeof PurchaseOrderSummaryDto>;
