import { z } from 'zod';

/**
 * P3-1 minimum field set for manual customer creation. `customerType`
 * stores lowercase 'retail'/'wholesale', matching every other enum-like
 * column in the schema (party_type, movement_type, item_type, ...).
 */
export const CreateCustomerInput = z.object({
  partyCode: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1),
  shopName: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  address: z.string().trim().min(1).nullable(),
  customerType: z.enum(['retail', 'wholesale']).nullable(),
  priceLevelId: z.string().uuid().nullable(),
  creditLimitPaisa: z.number().int().nonnegative().nullable(),
  notes: z.string().trim().min(1).nullable(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;

export const CustomerSearchInput = z.object({
  query: z.string().trim().default(''),
});
export type CustomerSearchInput = z.infer<typeof CustomerSearchInput>;

export const CustomerIdInput = z.object({
  id: z.string().uuid(),
});
export type CustomerIdInput = z.infer<typeof CustomerIdInput>;

export const CustomerDto = z.object({
  id: z.string().uuid(),
  partyCode: z.string(),
  name: z.string(),
  shopName: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  customerType: z.enum(['retail', 'wholesale']).nullable(),
  priceLevelId: z.string().uuid().nullable(),
  creditLimitPaisa: z.number().int().nullable(),
  notes: z.string().nullable(),
});
export type CustomerDto = z.infer<typeof CustomerDto>;

export const CustomerBalanceDto = z.object({
  customerId: z.string().uuid(),
  balancePaisa: z.number().int(),
});
export type CustomerBalanceDto = z.infer<typeof CustomerBalanceDto>;

export const CustomerLedgerInput = z.object({
  customerId: z.string().uuid(),
});
export type CustomerLedgerInput = z.infer<typeof CustomerLedgerInput>;

export const CustomerLedgerRowDto = z.object({
  id: z.string(),
  entryDate: z.string(),
  entryType: z.string(),
  amountPaisa: z.number().int(),
  runningBalancePaisa: z.number().int(),
  billReference: z.string().nullable(),
  billNotes: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  saleDocNo: z.string().nullable(),
  saleTotalPaisa: z.number().int().nullable(),
  salePaidPaisa: z.number().int().nullable(),
  saleDiscountPaisa: z.number().int().nullable(),
  saleStatus: z.string().nullable(),
  salePaymentMode: z.string().nullable(),
  paymentDocNo: z.string().nullable(),
  paymentAmountPaisa: z.number().int().nullable(),
  paymentMethod: z.string().nullable(),
  paymentReferenceNo: z.string().nullable(),
});
export type CustomerLedgerRowDto = z.infer<typeof CustomerLedgerRowDto>;

export const CustomerStatementInput = z.object({
  customerId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CustomerStatementInput = z.infer<typeof CustomerStatementInput>;

/** CL-8D. customer:statement / print:printCustomerStatement. */
export const CustomerStatementDto = z.object({
  customer: z.object({
    name: z.string(),
    code: z.string(),
    phone: z.string().nullable(),
  }),
  fromDate: z.string(),
  toDate: z.string(),
  openingBalancePaisa: z.number().int(),
  rows: z.array(CustomerLedgerRowDto),
  closingBalancePaisa: z.number().int(),
});
export type CustomerStatementDto = z.infer<typeof CustomerStatementDto>;

/** CL-9. AddCustomerModal's price-level dropdown — party:listPriceLevels. */
export const PriceLevelDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type PriceLevelDto = z.infer<typeof PriceLevelDto>;

export const PriceLevelsDto = z.array(PriceLevelDto);
export type PriceLevelsDto = z.infer<typeof PriceLevelsDto>;

/** CL-10. Option B conversion — the renderer reads the CSV and sends content directly. */
export const ImportCustomerBalanceInput = z.object({
  balancesCsv: z.string().min(1),
});
export type ImportCustomerBalanceInput = z.infer<typeof ImportCustomerBalanceInput>;
