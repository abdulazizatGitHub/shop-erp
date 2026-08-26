/** Exact Supplier Opening Balance sheet column headers, per P2-3. Order
 * matters for humans reading the template but not for parsing — parseCsv
 * matches by name. */
export const SUPPLIER_BALANCE_COLUMNS = [
  'Supplier Name',
  'Phone',
  'Bill Reference',
  'Bill Date',
  'Original Amount (PKR)',
  'Amount Paid So Far (PKR)',
  'Due Date',
  'Notes',
] as const;
