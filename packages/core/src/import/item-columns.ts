/** Exact Items sheet column headers, as given by the owner. Order matters
 * for humans reading the template but not for parsing — parseCsv matches
 * by name. */
export const ITEM_COLUMNS = [
  'Item Code',
  'Item Name (English)',
  'Item Name (Urdu)',
  'Owning Business Unit',
  'Category',
  'Brand / Company',
  'Variant / Spec',
  'Selling Unit',
  'Purchase Unit',
  'Units per Purchase Unit',
  'Track Stock? (Y/N)',
  'Has Serial No? (Y/N)',
  'Purchase Price (PKR)',
  'Retail Price (PKR)',
  'Wholesale Price (PKR)',
  'Low Stock Alert Qty',
  'Shelf / Location',
  'Notes',
  'Alt Unit',
  'Alt Factor',
] as const;

export const OPENING_STOCK_COLUMNS = [
  'Item Code',
  'Item Name (English)',
  'Count Date',
  'Quantity Counted',
  'Unit Cost (PKR)',
  'Serial Numbers',
  'Shelf / Location',
  'Counted By',
  'Notes',
] as const;

/** "Spare Parts" -> PARTS, "Repair" -> REPAIR. Any other value is rejected. */
export const BUSINESS_UNIT_LABEL_TO_CODE: ReadonlyMap<string, string> = new Map([
  ['Spare Parts', 'PARTS'],
  ['Repair', 'REPAIR'],
]);
