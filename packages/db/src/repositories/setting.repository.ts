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
