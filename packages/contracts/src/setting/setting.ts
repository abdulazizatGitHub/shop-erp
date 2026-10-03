import { z } from 'zod';

/** P4-1a. One fixed, named setting — not a generic key/value passthrough. */
export const SetReceiptPaperSizeInput = z.object({
  value: z.enum(['A4', 'A5']),
});
export type SetReceiptPaperSizeInput = z.infer<typeof SetReceiptPaperSizeInput>;

/** P17-1 (docs/phases/PHASE_17.md §2.1, Q17-6). Counter sales only. */
export const SetNegativeStockPolicyInput = z.object({
  value: z.enum(['warn', 'block']),
});
export type SetNegativeStockPolicyInput = z.infer<typeof SetNegativeStockPolicyInput>;

/** P17-2 (docs/phases/PHASE_17.md §2.2, S17-ITEM-2). Milli-units — used when an item's own reorder_level is null. */
export const SetDefaultLowStockThresholdInput = z.object({
  value: z.number().int().nonnegative(),
});
export type SetDefaultLowStockThresholdInput = z.infer<typeof SetDefaultLowStockThresholdInput>;

/**
 * P17-3 (docs/phases/PHASE_17.md §2.5, S17-REP-1). One shared value read
 * by every report/list table via the client's useRowsPerPage() hook —
 * not a generic numeric field, a fixed 3-choice setting (10/25/50).
 */
export const RowsPerPage = z.union([z.literal(10), z.literal(25), z.literal(50)]);
export type RowsPerPage = z.infer<typeof RowsPerPage>;

export const SetRowsPerPageInput = z.object({ value: RowsPerPage });
export type SetRowsPerPageInput = z.infer<typeof SetRowsPerPageInput>;

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

/**
 * P17-7 (docs/phases/PHASE_17.md §2.6, S17-EXP-4, A17-5). One combined
 * read (used both by PaymentMethodToggle.tsx, the picker, and by
 * PaymentMethodsSettingsSection.tsx on load) — same "combined read for
 * display, individual setters for Settings" shape as
 * DiscountConfigDto/getDiscountConfig. All five default `true` — "every
 * method enabled" is today's behaviour, unlike every other boolean
 * setting in this file (which default `false` when unset).
 */
export const PaymentMethodsEnabledDto = z.object({
  cash: z.boolean(),
  bank: z.boolean(),
  easypaisa: z.boolean(),
  jazzcash: z.boolean(),
  cheque: z.boolean(),
});
export type PaymentMethodsEnabledDto = z.infer<typeof PaymentMethodsEnabledDto>;

/**
 * A17-5 — cash can never be disabled. Enforced here, at the Zod
 * boundary the IPC handler parses against, not just by the Settings
 * UI's own disabled toggle: a `{ value: false }` payload fails
 * validation before the handler body (or the repository) ever runs.
 */
export const SetPaymentMethodCashEnabledInput = z.object({ value: z.literal(true) });
export type SetPaymentMethodCashEnabledInput = z.infer<typeof SetPaymentMethodCashEnabledInput>;

export const SetPaymentMethodBankEnabledInput = z.object({ value: z.boolean() });
export type SetPaymentMethodBankEnabledInput = z.infer<typeof SetPaymentMethodBankEnabledInput>;

export const SetPaymentMethodEasypaisaEnabledInput = z.object({ value: z.boolean() });
export type SetPaymentMethodEasypaisaEnabledInput = z.infer<
  typeof SetPaymentMethodEasypaisaEnabledInput
>;

export const SetPaymentMethodJazzcashEnabledInput = z.object({ value: z.boolean() });
export type SetPaymentMethodJazzcashEnabledInput = z.infer<
  typeof SetPaymentMethodJazzcashEnabledInput
>;

export const SetPaymentMethodChequeEnabledInput = z.object({ value: z.boolean() });
export type SetPaymentMethodChequeEnabledInput = z.infer<typeof SetPaymentMethodChequeEnabledInput>;

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

/** CL-0a. Single source of truth for every printed document's shop header/footer. */
export const ShopIdentityDto = z.object({
  shopName: z.string(),
  shopPhone: z.string().nullable(),
  shopAddress: z.string().nullable(),
  shopEmail: z.string().nullable(),
  invoiceHeaderText: z.string().nullable(),
  invoiceFooterText: z.string().nullable(),
  statementFooterText: z.string().nullable(),
});
export type ShopIdentityDto = z.infer<typeof ShopIdentityDto>;

export const SetShopIdentityInput = z.object({
  shopName: z.string().trim().min(1),
  shopPhone: z.string().trim().min(1).nullable(),
  shopAddress: z.string().trim().min(1).nullable(),
  shopEmail: z.string().trim().min(1).nullable(),
  invoiceHeaderText: z.string().trim().min(1).nullable(),
  invoiceFooterText: z.string().trim().min(1).nullable(),
  statementFooterText: z.string().trim().min(1).nullable(),
});
export type SetShopIdentityInput = z.infer<typeof SetShopIdentityInput>;
