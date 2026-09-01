import { useEffect, useState } from 'react';
import { ItemsPage } from '../pages/items/ItemsPage.js';
import { CustomersPage } from '../pages/parties/CustomersPage.js';
import { SuppliersPage } from '../pages/parties/SuppliersPage.js';
import { PurchasePage } from '../pages/purchases/PurchasePage.js';
import { ReportsPage } from '../pages/reports/ReportsPage.js';
import { SalePage } from '../pages/sales/SalePage.js';
import { SettingsPage } from '../pages/settings/SettingsPage.js';
import { NAV_ITEMS } from './navigation.js';
import type { Tab } from './navigation.js';
import { Sidebar } from './Sidebar.js';

export function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('sales');

  // Alt+1..7 — direct tab switching, documented on each sidebar item.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.altKey) return;
      const item = NAV_ITEMS.find((i) => i.shortcutDigit === event.key);
      if (!item) return;
      event.preventDefault();
      setTab(item.key);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="flex h-screen bg-surface-sunken">
      <Sidebar activeTab={tab} onSelectTab={setTab} />
      <main className="flex-1 overflow-y-auto p-6">
        {tab === 'sales' && <SalePage />}
        {tab === 'items' && <ItemsPage />}
        {tab === 'suppliers' && <SuppliersPage />}
        {tab === 'purchases' && <PurchasePage />}
        {tab === 'reports' && <ReportsPage />}
        {tab === 'customers' && <CustomersPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
