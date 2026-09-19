/**
 * Single source of truth for shop identity fields printed on every
 * document (receipt, invoice, payment receipt, customer statement).
 * Read once via getShopIdentity (packages/db) and passed through by
 * the handler — no PDF generator reads settings independently.
 */
export interface ShopIdentity {
  readonly shopName: string;
  readonly shopPhone: string | null;
  readonly shopAddress: string | null;
  readonly shopEmail: string | null;
  readonly invoiceHeaderText: string | null;
  readonly invoiceFooterText: string | null;
  readonly statementFooterText: string | null;
}
