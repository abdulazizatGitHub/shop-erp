import type { Kysely } from 'kysely';
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

// Wholesale default discount (sale-level, C-5). Two mutually exclusive
// forms — a percentage or a fixed paisa amount — stored as separate keys,
// same flat setting table as every other value here. Whichever the
// salesman/owner sets non-zero, the checkout screen pre-fills from; the
// repository layer never resolves "which one wins" — that's the UI's job
// (CheckoutPanel clears the other field on entry).
const WHOLESALE_DEFAULT_DISCOUNT_PCT_KEY = 'wholesaleDefaultDiscountPct';
const WHOLESALE_DEFAULT_DISCOUNT_PAISA_KEY = 'wholesaleDefaultDiscountPaisa';

async function getNumericSetting(
  db: Kysely<Database>,
  tenantId: string,
  key: string,
): Promise<number> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', key)
    .executeTakeFirst();
  const parsed = row?.value !== undefined ? Number(row.value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function setNumericSetting(
  db: Kysely<Database>,
  tenantId: string,
  key: string,
  value: number,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insertInto('setting')
    .values({ tenantId, key, value: String(value), updatedAt })
    .onConflict((oc) =>
      oc.columns(['tenantId', 'key']).doUpdateSet({ value: String(value), updatedAt }),
    )
    .execute();
}

/** Percentage, 0-100, up to two decimal places. 0 = no default set. */
export async function getWholesaleDefaultDiscountPct(
  db: Kysely<Database>,
  tenantId: string,
): Promise<number> {
  return getNumericSetting(db, tenantId, WHOLESALE_DEFAULT_DISCOUNT_PCT_KEY);
}

export async function setWholesaleDefaultDiscountPct(
  db: Kysely<Database>,
  tenantId: string,
  value: number,
): Promise<void> {
  return setNumericSetting(db, tenantId, WHOLESALE_DEFAULT_DISCOUNT_PCT_KEY, value);
}

/** Fixed paisa amount. 0 = no default set. */
export async function getWholesaleDefaultDiscountPaisa(
  db: Kysely<Database>,
  tenantId: string,
): Promise<number> {
  return getNumericSetting(db, tenantId, WHOLESALE_DEFAULT_DISCOUNT_PAISA_KEY);
}

export async function setWholesaleDefaultDiscountPaisa(
  db: Kysely<Database>,
  tenantId: string,
  value: number,
): Promise<void> {
  return setNumericSetting(db, tenantId, WHOLESALE_DEFAULT_DISCOUNT_PAISA_KEY, value);
}
