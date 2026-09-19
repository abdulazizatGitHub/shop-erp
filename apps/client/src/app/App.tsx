import { useEffect, useState } from 'react';
import { ToastProvider } from '@shop/ui';
import { ShopIdentityProvider } from '../context/ShopIdentityContext.js';
import { ItemsPage } from '../pages/items/ItemsPage.js';
import JobsPage from '../pages/jobs/JobsPage.js';
import TechnicianCustodyPage from '../pages/jobs/TechnicianCustodyPage.js';
import { AttendancePage } from '../pages/attendance/AttendancePage.js';
import { DashboardPage } from '../pages/dashboard/DashboardPage.js';
import { ExpensesPage } from '../pages/expenses/ExpensesPage.js';
import { CustomersPage } from '../pages/parties/CustomersPage.js';
import { SuppliersPage } from '../pages/parties/SuppliersPage.js';
import { PurchaseOrdersPage } from '../pages/purchase-orders/PurchaseOrdersPage.js';
import { ReportsPage } from '../pages/reports/ReportsPage.js';
import { SalePage } from '../pages/sales/SalePage.js';
import { SettingsPage } from '../pages/settings/SettingsPage.js';
import { StaffPage } from '../pages/staff/StaffPage.js';
import { NAV_ITEMS } from './navigation.js';
import type { ReportsGroup, Tab } from './navigation.js';
import { Sidebar } from './Sidebar.js';

export function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('sales');
  // P11-1 — which Reports sub-group ("Daily Reports"/"Accounts") is current.
  // Kept independent of `tab` so it's remembered if the owner leaves Reports
  // and comes back via Alt+5 or another nav item, not just via the sidebar.
  const [reportsGroup, setReportsGroup] = useState<ReportsGroup>('daily');

  function handleSelectReportsGroup(group: ReportsGroup): void {
    setReportsGroup(group);
    setTab('reports');
  }

  // Alt+1..9 — direct tab switching, documented on each sidebar item.
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
    <ToastProvider>
      <ShopIdentityProvider>
        <div className="flex h-screen bg-surface-sunken">
          <Sidebar
            activeTab={tab}
            onSelectTab={setTab}
            activeReportsGroup={reportsGroup}
            onSelectReportsGroup={handleSelectReportsGroup}
          />
          <main className="flex-1 overflow-y-auto p-6">
            {tab === 'sales' && <SalePage />}
            {tab === 'items' && <ItemsPage />}
            {tab === 'suppliers' && <SuppliersPage />}
            {tab === 'purchase-orders' && <PurchaseOrdersPage />}
            {tab === 'jobs' && <JobsPage />}
            {tab === 'technician-custody' && <TechnicianCustodyPage />}
            {tab === 'reports' && (
              <ReportsPage activeGroup={reportsGroup} onActiveGroupChange={setReportsGroup} />
            )}
            {tab === 'customers' && <CustomersPage />}
            {tab === 'settings' && <SettingsPage />}
            {tab === 'staff' && <StaffPage />}
            {tab === 'expenses' && <ExpensesPage />}
            {tab === 'dashboard' && <DashboardPage />}
            {tab === 'attendance' && <AttendancePage />}
          </main>
        </div>
      </ShopIdentityProvider>
    </ToastProvider>
  );
}
