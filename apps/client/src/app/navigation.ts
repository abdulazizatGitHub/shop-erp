export type Tab =
  'sales' | 'items' | 'suppliers' | 'purchases' | 'reports' | 'customers' | 'settings';

export interface NavItem {
  readonly key: Tab;
  readonly label: string;
  /** The digit in Alt+N — single source of truth for both the sidebar label and the shortcut handler. */
  readonly shortcutDigit: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'sales', label: 'Sales', shortcutDigit: '1' },
  { key: 'items', label: 'Items', shortcutDigit: '2' },
  { key: 'suppliers', label: 'Suppliers', shortcutDigit: '3' },
  { key: 'purchases', label: 'Purchases', shortcutDigit: '4' },
  { key: 'reports', label: 'Reports', shortcutDigit: '5' },
  { key: 'customers', label: 'Customers', shortcutDigit: '6' },
  { key: 'settings', label: 'Settings', shortcutDigit: '7' },
];
