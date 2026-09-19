/** Shared between CustomerLedgerTable.tsx and LedgerExportMenu.tsx — client-side derivation of a human description from `entryType`. */
export const DESCRIPTIONS: Record<string, string> = {
  sale: 'Credit sale',
  payment_received: 'Payment received',
  opening_balance: 'Opening balance',
  sale_return: 'Sale cancelled',
};
