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

// Discount presets (owner-configured, replaces the old free-form discount
// inputs on the sale screen — see CheckoutPanel.tsx). A preset amount is
// stored/edited as a plain numeric string (the owner's CSV entry, one
// value per array element); paisa conversion for PKR presets happens only
// in the settings IPC handler, never here or in the renderer.
const PresetAmountString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Must be a positive number');

export const SetDiscountApplyWalkinInput = z.object({ value: z.boolean() });
export type SetDiscountApplyWalkinInput = z.infer<typeof SetDiscountApplyWalkinInput>;

export const SetDiscountApplyWholesaleInput = z.object({ value: z.boolean() });
export type SetDiscountApplyWholesaleInput = z.infer<typeof SetDiscountApplyWholesaleInput>;

export const SetDiscountPkrEnabledInput = z.object({ value: z.boolean() });
export type SetDiscountPkrEnabledInput = z.infer<typeof SetDiscountPkrEnabledInput>;

export const SetDiscountPctEnabledInput = z.object({ value: z.boolean() });
export type SetDiscountPctEnabledInput = z.infer<typeof SetDiscountPctEnabledInput>;

export const SetDiscountPkrPresetsInput = z.object({
  value: z.array(PresetAmountString).max(20),
});
export type SetDiscountPkrPresetsInput = z.infer<typeof SetDiscountPkrPresetsInput>;

export const SetDiscountPctPresetsInput = z.object({
  value: z.array(PresetAmountString).max(20),
});
export type SetDiscountPctPresetsInput = z.infer<typeof SetDiscountPctPresetsInput>;

/** settings:getDiscountConfig — the sale screen's single combined read. PKR
 * presets arrive already converted to paisa; percentages stay plain numbers. */
export const DiscountConfigDto = z.object({
  applyToWalkin: z.boolean(),
  applyToWholesale: z.boolean(),
  pkrEnabled: z.boolean(),
  pkrPresets: z.array(z.number().int().nonnegative()),
  pctEnabled: z.boolean(),
  pctPresets: z.array(z.number().nonnegative().max(100)),
});
export type DiscountConfigDto = z.infer<typeof DiscountConfigDto>;
