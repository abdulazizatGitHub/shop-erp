import {
  AlertTriangle,
  CheckSquare,
  DatabaseBackup,
  Percent,
  Receipt,
  Store,
  Tag,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SettingsNavItem {
  readonly key: string;
  readonly path: string;
  readonly title: string;
  readonly hint: string;
  readonly icon: LucideIcon;
  /** Reserved for P16-3b (Commission Approvals' pending-claim count) — unused until then. */
  readonly badge?: number;
}

export interface SettingsNavGroup {
  readonly label: string;
  readonly items: readonly SettingsNavItem[];
}

export const SETTINGS_NAV: readonly SettingsNavGroup[] = [
  {
    label: 'General',
    items: [
      {
        key: 'shop',
        path: '/settings/shop',
        title: 'Shop',
        hint: 'Name, phone, address, email',
        icon: Store,
      },
      {
        key: 'invoices',
        path: '/settings/invoices',
        title: 'Invoices & Receipts',
        hint: 'Header, footer, paper size',
        icon: Receipt,
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        key: 'discounts',
        path: '/settings/sales/discounts',
        title: 'Discounts',
        hint: 'Presets and eligibility',
        icon: Percent,
      },
      {
        key: 'stock-alerts',
        path: '/settings/sales/stock-alerts',
        title: 'Stock & Alerts',
        hint: 'Negative-stock policy for counter sales',
        icon: AlertTriangle,
      },
    ],
  },
  {
    label: 'Jobs',
    items: [
      {
        key: 'service-charges',
        path: '/settings/jobs/service-charges',
        title: 'Service Charges',
        hint: 'Labour charges and commission',
        icon: Wrench,
      },
      {
        key: 'brands',
        path: '/settings/jobs/brands',
        title: 'Brands',
        hint: 'Appliance brand list',
        icon: Tag,
      },
      {
        key: 'commission-approvals',
        path: '/settings/jobs/commission-approvals',
        title: 'Commission Approvals',
        hint: 'Review and approve claims',
        icon: CheckSquare,
      },
    ],
  },
  {
    label: 'Data',
    items: [
      {
        key: 'backup',
        path: '/settings/backup',
        title: 'Backup & Restore',
        hint: 'Export or restore the database',
        icon: DatabaseBackup,
      },
    ],
  },
];
