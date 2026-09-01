import { z } from 'zod';

/**
 * PG-B purchase entry. Mirrors packages/core/src/purchase/
 * purchase.repository.port.ts's NewPurchaseInput/NewPurchaseLineInput
 * exactly — see PG-B session notes for three deviations from the
 * original kickoff draft: no purchaseUomId (doesn't exist on the port —
 * per-line UoM conversion already comes from item.purchaseToStockFactor,
 * read inside createPurchase), paymentMode restricted to 'cash'/'credit'
 * (the only values PurchasePaymentMode accepts), and
 * supplierInvoiceNo/billReference/dueDate/billNotes added (required by
 * NewPurchaseInput, used directly in the credit-purchase party_ledger
 * insert).
 */
export const PurchaseLineInput = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int().positive(),
  unitCostPaisa: z.number().int().positive(),
  notes: z.string().trim().min(1).nullable(),
});
export type PurchaseLineInput = z.infer<typeof PurchaseLineInput>;

export const CreatePurchaseInput = z.object({
  supplierId: z.string().uuid(),
  /** null = the tenant's default warehouse (seeded "Shop"). */
  warehouseId: z.string().uuid().nullable(),
  purchaseDate: z.string().min(1),
  supplierInvoiceNo: z.string().trim().min(1).nullable(),
  paymentMode: z.enum(['cash', 'credit']),
  /** Credit only; null for cash (no party_ledger row is posted). */
  billReference: z.string().trim().min(1).nullable(),
  dueDate: z.string().min(1).nullable(),
  billNotes: z.string().trim().min(1).nullable(),
  notes: z.string().trim().min(1).nullable(),
  lines: z.array(PurchaseLineInput).min(1),
});
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseInput>;

export const PurchaseIdInput = z.object({
  id: z.string().uuid(),
});
export type PurchaseIdInput = z.infer<typeof PurchaseIdInput>;

/** Mirrors PurchaseLineRecord exactly. */
export const PurchaseLineDto = z.object({
  itemId: z.string().uuid(),
  quantityMilli: z.number().int(),
  stockQuantityMilli: z.number().int(),
  unitCostPaisa: z.number().int(),
  lineTotalPaisa: z.number().int(),
});
export type PurchaseLineDto = z.infer<typeof PurchaseLineDto>;

/** Mirrors PurchaseRecord (purchase.repository.port.ts's getPurchaseById return type) exactly. */
export const PurchaseDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  purchaseDate: z.string(),
  paymentMode: z.enum(['cash', 'credit']),
  totalAmountPaisa: z.number().int(),
  paidAmountPaisa: z.number().int(),
  status: z.string(),
  businessUnitId: z.string().uuid(),
  lines: z.array(PurchaseLineDto),
});
export type PurchaseDto = z.infer<typeof PurchaseDto>;

/** P4.5-5 correction 2 (BUG-16's real-list fix) — the Purchases screen's list input. */
export const PurchaseListInput = z.object({
  limit: z.number().int().positive().max(1000).default(100),
});
export type PurchaseListInput = z.infer<typeof PurchaseListInput>;

/** Mirrors PurchaseListRow (purchase.repository.port.ts's listPurchases return type) exactly. */
export const PurchaseListRowDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  purchaseDate: z.string(),
  paymentMode: z.enum(['cash', 'credit']),
  totalAmountPaisa: z.number().int(),
  status: z.string(),
});
export type PurchaseListRowDto = z.infer<typeof PurchaseListRowDto>;
