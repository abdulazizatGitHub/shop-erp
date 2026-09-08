import { z } from 'zod';

/** P4-1a. One fixed, named setting — not a generic key/value passthrough. */
export const SetReceiptPaperSizeInput = z.object({
  value: z.enum(['A4', 'A5']),
});
export type SetReceiptPaperSizeInput = z.infer<typeof SetReceiptPaperSizeInput>;

/** P4-1c. Placeholder default ("Shop ERP") until the owner sets the real name. */
export const SetShopNameInput = z.object({
  value: z.string().trim().min(1),
});
export type SetShopNameInput = z.infer<typeof SetShopNameInput>;

/** Sale-level wholesale discount defaults (C-5). Two mutually exclusive forms. */
export const SetWholesaleDefaultDiscountPctInput = z.object({
  value: z.number().min(0).max(100),
});
export type SetWholesaleDefaultDiscountPctInput = z.infer<
  typeof SetWholesaleDefaultDiscountPctInput
>;

export const SetWholesaleDefaultDiscountPaisaInput = z.object({
  value: z.number().int().min(0),
});
export type SetWholesaleDefaultDiscountPaisaInput = z.infer<
  typeof SetWholesaleDefaultDiscountPaisaInput
>;
