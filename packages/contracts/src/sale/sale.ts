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
});
export type CreateSaleInput = z.infer<typeof CreateSaleInput>;

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
