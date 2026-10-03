import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

// P17-7 (docs/phases/PHASE_17.md §2.6, S17-EXP-4, A17-5). Own file,
// same "extracted before setting.repository.ts/setting.handler.ts
// cross ~300 lines" convention as stock-alerts-setting.*/
// reports-display-setting.* — plain key-value pattern, no core port/
// service (CLAUDE.md §10 — each is its own fixed, named setting).
//
// Unlike every boolean setting in setting.repository.ts (which default
// to false when unset), these five default to TRUE — "today's
// behaviour" is every payment method enabled; the setting only ever
// narrows that down.

const BooleanSettingValue = z.enum(['true', 'false']);

const CASH_KEY = 'paymentMethodCashEnabled';
const BANK_KEY = 'paymentMethodBankEnabled';
const EASYPAISA_KEY = 'paymentMethodEasypaisaEnabled';
const JAZZCASH_KEY = 'paymentMethodJazzcashEnabled';
const CHEQUE_KEY = 'paymentMethodChequeEnabled';

async function getEnabled(db: Kysely<Database>, tenantId: string, key: string): Promise<boolean> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', key)
    .executeTakeFirst();
  const parsed = BooleanSettingValue.safeParse(row?.value ?? undefined);
  // Default TRUE when unset (A17-5) — opposite of getBooleanSetting's
  // default-false in setting.repository.ts.
  return parsed.success ? parsed.data === 'true' : true;
}

async function setEnabled(
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

export interface PaymentMethodsEnabled {
  readonly cash: boolean;
  readonly bank: boolean;
  readonly easypaisa: boolean;
  readonly jazzcash: boolean;
  readonly cheque: boolean;
}

/** One combined read — PaymentMethodToggle.tsx's picker and PaymentMethodsSettingsSection.tsx's own load both use this, not 5 separate fetches. */
export async function getPaymentMethodsEnabled(
  db: Kysely<Database>,
  tenantId: string,
): Promise<PaymentMethodsEnabled> {
  const [cash, bank, easypaisa, jazzcash, cheque] = await Promise.all([
    getEnabled(db, tenantId, CASH_KEY),
    getEnabled(db, tenantId, BANK_KEY),
    getEnabled(db, tenantId, EASYPAISA_KEY),
    getEnabled(db, tenantId, JAZZCASH_KEY),
    getEnabled(db, tenantId, CHEQUE_KEY),
  ]);
  return { cash, bank, easypaisa, jazzcash, cheque };
}

/**
 * A17-5 — cash can never be disabled. The authoritative Zod-boundary
 * enforcement is SetPaymentMethodCashEnabledInput (only `{value: true}`
 * is well-formed); `value: true` here is typed as the literal `true`,
 * not `boolean`, so even a caller that bypasses Zod cannot pass `false`
 * without a type error — belt-and-braces, same reasoning as every
 * other core-level rule in this phase (CLAUDE.md §3.7), just expressed
 * as a type instead of a thrown Error since there is genuinely nothing
 * else this function could do with `false`.
 */
export async function setPaymentMethodCashEnabled(
  db: Kysely<Database>,
  tenantId: string,
  value: true,
): Promise<void> {
  return setEnabled(db, tenantId, CASH_KEY, value);
}

export async function setPaymentMethodBankEnabled(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setEnabled(db, tenantId, BANK_KEY, value);
}

export async function setPaymentMethodEasypaisaEnabled(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setEnabled(db, tenantId, EASYPAISA_KEY, value);
}

export async function setPaymentMethodJazzcashEnabled(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setEnabled(db, tenantId, JAZZCASH_KEY, value);
}

export async function setPaymentMethodChequeEnabled(
  db: Kysely<Database>,
  tenantId: string,
  value: boolean,
): Promise<void> {
  return setEnabled(db, tenantId, CHEQUE_KEY, value);
}
