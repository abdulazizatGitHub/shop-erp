/** Exact Customer Opening Balance sheet column headers, per P3-4. No Due
 * Date column, unlike the supplier sheet — customers don't carry payment
 * terms this phase. Order matters for humans reading the template but not
 * for parsing — parseCsv matches by name. */
export const CUSTOMER_BALANCE_COLUMNS = [
  'Customer Name',
  'Phone',
  'Bill Reference',
  'Bill Date',
  'Original Amount (PKR)',
  'Amount Paid So Far (PKR)',
  'Notes',
] as const;
