import type { Kysely } from 'kysely';
import type { ShopIdentity } from '@shop/core';
import type { Database } from '../kysely-schema.js';

// CL-0a. Single source of truth for shop identity — reads all seven keys
// from the generic `setting` table in one query, same key/value shape as
// setting.repository.ts's getShopName/getReceiptPaperSize. shopName
// defaults to 'Shop ERP' (matches getShopName's own default); every
// other field defaults to null.

const SHOP_IDENTITY_KEYS = [
  'shopName',
  'shopPhone',
  'shopAddress',
  'shopEmail',
  'invoiceHeaderText',
  'invoiceFooterText',
  'statementFooterText',
] as const;

const DEFAULT_SHOP_NAME = 'Shop ERP';

export async function getShopIdentity(
  db: Kysely<Database>,
  tenantId: string,
): Promise<ShopIdentity> {
  const rows = await db
    .selectFrom('setting')
    .select(['key', 'value'])
    .where('tenantId', '=', tenantId)
    .where('key', 'in', SHOP_IDENTITY_KEYS)
    .execute();

  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    shopName: values.get('shopName') ?? DEFAULT_SHOP_NAME,
    shopPhone: values.get('shopPhone') ?? null,
    shopAddress: values.get('shopAddress') ?? null,
    shopEmail: values.get('shopEmail') ?? null,
    invoiceHeaderText: values.get('invoiceHeaderText') ?? null,
    invoiceFooterText: values.get('invoiceFooterText') ?? null,
    statementFooterText: values.get('statementFooterText') ?? null,
  };
}

/** Settings-page save — upserts all seven keys, same onConflict shape as setShopName. */
export async function setShopIdentity(
  db: Kysely<Database>,
  tenantId: string,
  identity: ShopIdentity,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const entries: ReadonlyArray<readonly [(typeof SHOP_IDENTITY_KEYS)[number], string | null]> = [
    ['shopName', identity.shopName],
    ['shopPhone', identity.shopPhone],
    ['shopAddress', identity.shopAddress],
    ['shopEmail', identity.shopEmail],
    ['invoiceHeaderText', identity.invoiceHeaderText],
    ['invoiceFooterText', identity.invoiceFooterText],
    ['statementFooterText', identity.statementFooterText],
  ];

  for (const [key, value] of entries) {
    await db
      .insertInto('setting')
      .values({ tenantId, key, value, updatedAt })
      .onConflict((oc) => oc.columns(['tenantId', 'key']).doUpdateSet({ value, updatedAt }))
      .execute();
  }
}
