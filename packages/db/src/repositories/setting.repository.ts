import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../kysely-schema.js';

// P4-1a. Plain key-value reads/writes on the generic `setting` table —
// no business rule attached (CLAUDE.md section 10: no metadata-driven
// engine; this is one fixed, named setting, not a generic key/value
// passthrough exposed to the renderer), so this skips the core
// port/service pattern the same way lookup.repository.ts's reference
// reads do.

export type ReceiptPaperSize = 'A4' | 'A5';

const RECEIPT_PAPER_SIZE_KEY = 'receiptPaperSize';
const DEFAULT_RECEIPT_PAPER_SIZE: ReceiptPaperSize = 'A4';

function isReceiptPaperSize(value: string | null): value is ReceiptPaperSize {
  return value === 'A4' || value === 'A5';
}

export async function getReceiptPaperSize(
  db: Kysely<Database>,
  tenantId: string,
): Promise<ReceiptPaperSize> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', RECEIPT_PAPER_SIZE_KEY)
    .executeTakeFirst();

  const storedValue = row?.value ?? null;
  return isReceiptPaperSize(storedValue) ? storedValue : DEFAULT_RECEIPT_PAPER_SIZE;
}

export async function setReceiptPaperSize(
  db: Kysely<Database>,
  tenantId: string,
  value: ReceiptPaperSize,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insertInto('setting')
    .values({ tenantId, key: RECEIPT_PAPER_SIZE_KEY, value, updatedAt })
    .onConflict((oc) => oc.columns(['tenantId', 'key']).doUpdateSet({ value, updatedAt }))
    .execute();
}

// P4-1c. Placeholder default only — the owner must change this to the
// real business name before go-live (logged in PROJECT.md). Nothing
// in the receipt template ever hardcodes a shop name; it always reads
// through here.
const SHOP_NAME_KEY = 'shopName';
const DEFAULT_SHOP_NAME = 'Shop ERP';

export async function getShopName(db: Kysely<Database>, tenantId: string): Promise<string> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', SHOP_NAME_KEY)
    .executeTakeFirst();

  return row?.value ?? DEFAULT_SHOP_NAME;
}

export async function setShopName(
  db: Kysely<Database>,
  tenantId: string,
  value: string,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insertInto('setting')
    .values({ tenantId, key: SHOP_NAME_KEY, value, updatedAt })
    .onConflict((oc) => oc.columns(['tenantId', 'key']).doUpdateSet({ value, updatedAt }))
    .execute();
}

// Discount presets (owner-configured, replaces the old free-form discount
// inputs — see CheckoutPanel.tsx/useDiscount.ts). Two boolean "apply to"
// flags, two enable/preset-list pairs (PKR and %). Each stored as its own
// key in the flat setting table, same shape as every other setting here.
// Boolean flags are stored as the literal strings 'true'/'false'; preset
// lists are stored as JSON arrays of the raw strings the owner typed (PKR
// amounts or percentages) — never paisa/percent-as-number at this layer.
// Every getter defends against a missing or malformed stored value with a
// safe default, same precedent as isReceiptPaperSize above.
const DISCOUNT_APPLY_WALKIN_KEY = 'discount_apply_walkin';
const DISCOUNT_APPLY_WHOLESALE_KEY = 'discount_apply_wholesale';
const DISCOUNT_PKR_ENABLED_KEY = 'discount_pkr_enabled';
const DISCOUNT_PCT_ENABLED_KEY = 'discount_pct_enabled';
const DISCOUNT_PKR_PRESETS_KEY = 'discount_pkr_presets';
const DISCOUNT_PCT_PRESETS_KEY = 'discount_pct_presets';

const BooleanSettingValue = z.enum(['true', 'false']);
const PresetListValue = z.array(z.string().trim().min(1));

async function getBooleanSetting(
  db: Kysely<Database>,
  tenantId: string,
  key: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', key)
    .executeTakeFirst();
  const parsed = BooleanSettingValue.safeParse(row?.value ?? undefined);
  return parsed.success && parsed.data === 'true';
}

async function setBooleanSetting(
  db: Kysely<Database>,
  tenantId: string,
  key: string,
  value: boolean,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const stored = value ? 'true' : 'false';
  await db
    .insertInto('setting')
    .values({ tenantId, key, value: stored, updatedAt })
    .onConflict((oc) => oc.columns(['tenantId', 'key']).doUpdateSet({ value: stored, updatedAt }))
    .execute();
}

async function getPresetListSetting(
  db: Kysely<Database>,
  tenantId: string,
  key: string,
): Promise<readonly string[]> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', key)
    .executeTakeFirst();
  if (row?.value === undefined || row.value === null) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(row.value) as unknown;
  } catch {
    return [];
  }
  const parsed = PresetListValue.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

async function setPresetListSetting(
  db: Kysely<Database>,
  tenantId: string,
  key: string,
  presets: readonly string[],
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const stored = JSON.stringify(presets);
  await db
    .insertInto('setting')
    .values({ tenantId, key, value: stored, updatedAt })
    .onConflict((oc) => oc.columns(['tenantId', 'key']).doUpdateSet({ value: stored, updatedAt }))
    .execute();
}

export async function getDiscountApplyWalkin(
  db: Kysely<Database>,
  tenantId: string,
): Promise<boolean> {
  return getBooleanSetting(db, tenantId, DISCOUNT_APPLY_WALKIN_KEY);
}

export async function setDiscountApplyWalkin(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setBooleanSetting(db, tenantId, DISCOUNT_APPLY_WALKIN_KEY, value);
}

export async function getDiscountApplyWholesale(
  db: Kysely<Database>,
  tenantId: string,
): Promise<boolean> {
  return getBooleanSetting(db, tenantId, DISCOUNT_APPLY_WHOLESALE_KEY);
}

export async function setDiscountApplyWholesale(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setBooleanSetting(db, tenantId, DISCOUNT_APPLY_WHOLESALE_KEY, value);
}

export async function getDiscountPkrEnabled(
  db: Kysely<Database>,
  tenantId: string,
): Promise<boolean> {
  return getBooleanSetting(db, tenantId, DISCOUNT_PKR_ENABLED_KEY);
}

export async function setDiscountPkrEnabled(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setBooleanSetting(db, tenantId, DISCOUNT_PKR_ENABLED_KEY, value);
}

export async function getDiscountPctEnabled(
  db: Kysely<Database>,
  tenantId: string,
): Promise<boolean> {
  return getBooleanSetting(db, tenantId, DISCOUNT_PCT_ENABLED_KEY);
}

export async function setDiscountPctEnabled(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setBooleanSetting(db, tenantId, DISCOUNT_PCT_ENABLED_KEY, value);
}

/** Raw PKR amount strings as the owner typed them, e.g. ["100", "200", "500"]. */
export async function getDiscountPkrPresets(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly string[]> {
  return getPresetListSetting(db, tenantId, DISCOUNT_PKR_PRESETS_KEY);
}

export async function setDiscountPkrPresets(
  db: Kysely<Database>,
  tenantId: string,
  presets: readonly string[],
): Promise<void> {
  return setPresetListSetting(db, tenantId, DISCOUNT_PKR_PRESETS_KEY, presets);
}

/** Raw percentage strings as the owner typed them, e.g. ["3", "5", "10"]. */
export async function getDiscountPctPresets(
  db: Kysely<Database>,
  tenantId: string,
): Promise<readonly string[]> {
  return getPresetListSetting(db, tenantId, DISCOUNT_PCT_PRESETS_KEY);
}

export async function setDiscountPctPresets(
  db: Kysely<Database>,
  tenantId: string,
  presets: readonly string[],
): Promise<void> {
  return setPresetListSetting(db, tenantId, DISCOUNT_PCT_PRESETS_KEY, presets);
}
