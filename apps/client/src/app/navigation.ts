export type Tab =
  | 'sales'
  | 'items'
  | 'suppliers'
  | 'purchases'
  | 'jobs'
  | 'technician-custody'
  | 'reports'
  | 'customers'
  | 'settings'
  | 'staff'
  | 'expenses'
  | 'dashboard'
  | 'attendance';

export interface NavItem {
  readonly key: Tab;
  readonly label: string;
  /**
   * The digit in Alt+N — single source of truth for both the sidebar
   * label and the shortcut handler. Optional: '0'-'9' are all taken
   * (confirmed by reading this file before adding Expenses, P7-4) and
   * the handler only matches a single `event.key` character, so an item
   * with no free digit gets no shortcut rather than stealing one or
   * inventing a multi-key scheme unprompted.
   */
  readonly shortcutDigit?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  // BUG-DASH-1 fix: Dashboard moved to the top of the sidebar — it's
  // the first thing the owner should see on opening the app. No
  // shortcut digit assigned (it had none before this move either),
  // so this doesn't disturb the existing Alt+1..Alt+0 assignments
  // below.
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'sales', label: 'Sales', shortcutDigit: '1' },
  { key: 'items', label: 'Items', shortcutDigit: '2' },
  { key: 'suppliers', label: 'Suppliers', shortcutDigit: '3' },
  { key: 'purchases', label: 'Purchases', shortcutDigit: '4' },
  { key: 'reports', label: 'Reports', shortcutDigit: '5' },
  { key: 'customers', label: 'Customers', shortcutDigit: '6' },
  { key: 'settings', label: 'Settings', shortcutDigit: '7' },
  { key: 'jobs', label: 'Jobs', shortcutDigit: '8' },
  { key: 'technician-custody', label: 'Custody', shortcutDigit: '9' },
  // Alt+1..9 are all taken (see above) — '0' is the next free single
  // character on the same event.key-matching scheme the handler already
  // uses. PHASE_7.md's GAP-9 only asked for the Add Staff Member UI, not
  // a nav slot; adding one anyway since attendance (P7-8) needs somewhere
  // to link "no staff yet" from, and Staff otherwise has no way to reach.
  { key: 'staff', label: 'Staff', shortcutDigit: '0' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'attendance', label: 'Attendance' },
];
