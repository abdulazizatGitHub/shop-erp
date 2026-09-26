import { z } from 'zod';

/**
 * A line's unitPricePaisa is an explicit override; when absent, price
 * resolution runs (customer price level -> default Retail -> fallback
 * Retail — see packages/core/src/sale/sale.ts resolvePricePaisa).
 */
export const SaleLineInput = z
  .object({
    itemId: z.string().uuid(),
    quantityMilli: z.number().int().positive(),
    unitPricePaisa: z.number().int().nonnegative().nullable(),
    // ADR-0013 Type 2 (item-specific alt-unit selling) — both optional,
    // both absent means the line was entered in stock_uom.
    saleUomId: z.string().uuid().optional(),
    saleToStockFactor: z.number().int().positive().optional(),
  })
  .refine((data) => (data.saleUomId === undefined) === (data.saleToStockFactor === undefined), {
    message: 'saleUomId and saleToStockFactor must both be given, or both left absent',
    path: ['saleToStockFactor'],
  });
export type SaleLineInput = z.infer<typeof SaleLineInput>;

export const CreateSaleInput = z.object({
  customerId: z.string().uuid().nullable(),
  warehouseId: z.string().uuid().nullable(),
  saleDate: z.string().min(1),
  paymentMode: z.enum(['cash', 'credit']),
  paidAmountPaisa: z.number().int().nonnegative(),
  notes: z.string().trim().min(1).nullable(),
  lines: z.array(SaleLineInput).min(1),
  // Sale-level discount off the bill total (not per-line). Deducted from
  // subtotal before it becomes total_amount — see packages/core/src/sale/sale.ts.
  discountPaisa: z.number().int().min(0).default(0),
  // P17-1 (Option C, docs/phases/PHASE_17.md §2.1 D17-1). Only meaningful
  // when negativeStockPolicy is 'warn' — the client sets this true only
  // on a resubmit after the owner confirms the NEGATIVE_STOCK_CONFIRMATION_
  // REQUIRED dialog. Under 'block' this can never bypass the block.
  acknowledgedNegativeStock: z.boolean().default(false),
});
export type CreateSaleInput = z.infer<typeof CreateSaleInput>;

/** P17-1. One item that would take the Shop counter's stock below zero — carried in a NegativeStockBlockedError/NegativeStockConfirmationRequiredError's `details.items`. */
export const NegativeStockItemDto = z.object({
  itemId: z.string(),
  name: z.string(),
  onHandMilli: z.number().int(),
  requestedMilli: z.number().int(),
});
export type NegativeStockItemDto = z.infer<typeof NegativeStockItemDto>;

export const SaleWarnings = z.object({
  creditLimitExceeded: z.boolean(),
  stockBelowZero: z.boolean(),
  unitCostMissing: z.boolean(),
});
export type SaleWarnings = z.infer<typeof SaleWarnings>;

export const SaleResult = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  totalAmountPaisa: z.number().int(),
  discountPaisa: z.number().int(),
  warnings: SaleWarnings,
});
export type SaleResult = z.infer<typeof SaleResult>;

export const CancelSaleInput = z.object({
  id: z.string().uuid(),
});
export type CancelSaleInput = z.infer<typeof CancelSaleInput>;

export const SaleIdInput = z.object({
  id: z.string().uuid(),
});
export type SaleIdInput = z.infer<typeof SaleIdInput>;

/** All fields optional — an unset field is not filtered on. */
export const SaleSearchInput = z.object({
  dateFrom: z.string().min(1).nullable().default(null),
  dateTo: z.string().min(1).nullable().default(null),
  customerId: z.string().uuid().nullable().default(null),
  status: z.string().min(1).nullable().default(null),
});
export type SaleSearchInput = z.infer<typeof SaleSearchInput>;

export const SaleSummaryDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  customerId: z.string().uuid().nullable(),
  saleDate: z.string(),
  paymentMode: z.string().nullable(),
  totalAmountPaisa: z.number().int(),
  paidAmountPaisa: z.number().int(),
  status: z.string(),
});
export type SaleSummaryDto = z.infer<typeof SaleSummaryDto>;

/** CL-4. SaleInvoiceModal's read — SaleSummaryDto carries no line items. */
export const SaleWithLinesInput = z.object({
  id: z.string().uuid(),
});
export type SaleWithLinesInput = z.infer<typeof SaleWithLinesInput>;

export const SaleWithLinesLineDto = z.object({
  itemName: z.string(),
  quantityMilli: z.number().int(),
  unitName: z.string(),
  unitPricePaisa: z.number().int(),
  lineTotalPaisa: z.number().int(),
  lineKind: z.string(),
  businessUnitName: z.string().nullable(),
});
export type SaleWithLinesLineDto = z.infer<typeof SaleWithLinesLineDto>;

export const SaleWithLinesDto = z.object({
  docNo: z.string(),
  saleDate: z.string(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerAddress: z.string().nullable(),
  lines: z.array(SaleWithLinesLineDto),
  totalAmountPaisa: z.number().int(),
  paidAmountPaisa: z.number().int(),
  balanceDuePaisa: z.number().int(),
  jobDocNo: z.string().nullable(),
  reportedFault: z.string().nullable(),
  technicianName: z.string().nullable(),
});
export type SaleWithLinesDto = z.infer<typeof SaleWithLinesDto>;
