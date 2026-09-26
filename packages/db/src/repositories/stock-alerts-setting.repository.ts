import type { Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

// P17-1/P17-2 (docs/phases/PHASE_17.md §2.1/§2.2). Extracted out of
// setting.repository.ts once it crossed the 300-line convention —
// same plain key-value pattern as every other setting there (no core
// port/service, CLAUDE.md §10 — not a generic key/value passthrough,
// each is its own fixed, named setting).

// P17-1 (Q17-6). Counter sales only — scope enforced by the caller
// (sale.repository.ts), not here.
export type NegativeStockPolicy = 'warn' | 'block';

const NEGATIVE_STOCK_POLICY_KEY = 'negativeStockPolicy';
const DEFAULT_NEGATIVE_STOCK_POLICY: NegativeStockPolicy = 'warn';

function isNegativeStockPolicy(value: string | null): value is NegativeStockPolicy {
  return value === 'warn' || value === 'block';
}

/** Read inside the same transaction as the stock check when called from sale.repository.ts (D17-1) — pass the transaction's own Kysely handle, not a fresh connection. */
export async function getNegativeStockPolicy(
  db: Kysely<Database>,
  tenantId: string,
): Promise<NegativeStockPolicy> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', NEGATIVE_STOCK_POLICY_KEY)
    .executeTakeFirst();

  const storedValue = row?.value ?? null;
  return isNegativeStockPolicy(storedValue) ? storedValue : DEFAULT_NEGATIVE_STOCK_POLICY;
}

export async function setNegativeStockPolicy(
  db: Kysely<Database>,
  tenantId: string,
  value: NegativeStockPolicy,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .insertInto('setting')
    .values({ tenantId, key: NEGATIVE_STOCK_POLICY_KEY, value, updatedAt })
    .onConflict((oc) => oc.columns(['tenantId', 'key']).doUpdateSet({ value, updatedAt }))
    .execute();
}

// P17-2 (S17-ITEM-2). Milli-units — used when an item's own
// reorder_level is null. Stored as a numeric string, same convention as
// the discount preset amounts.
const DEFAULT_LOW_STOCK_THRESHOLD_KEY = 'lowStockThresholdMilli';
const DEFAULT_LOW_STOCK_THRESHOLD_MILLI = 0;

export async function getDefaultLowStockThresholdMilli(
  db: Kysely<Database>,
  tenantId: string,
): Promise<number> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', DEFAULT_LOW_STOCK_THRESHOLD_KEY)
    .executeTakeFirst();

  const parsed = row?.value !== undefined && row.value !== null ? Number(row.value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_LOW_STOCK_THRESHOLD_MILLI;
}

export async function setDefaultLowStockThresholdMilli(
  db: Kysely<Database>,
  tenantId: string,
  valueMilli: number,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const value = String(valueMilli);
  await db
    .insertInto('setting')
    .values({ tenantId, key: DEFAULT_LOW_STOCK_THRESHOLD_KEY, value, updatedAt })
    .onConflict((oc) => oc.columns(['tenantId', 'key']).doUpdateSet({ value, updatedAt }))
    .execute();
}
