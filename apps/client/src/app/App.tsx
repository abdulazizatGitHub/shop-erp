import { useState } from 'react';
import { ItemsPage } from '../pages/items/ItemsPage.js';
import { CustomersImportPage } from '../pages/parties/CustomersImportPage.js';
import { SuppliersPage } from '../pages/parties/SuppliersPage.js';
import { PurchasePage } from '../pages/purchases/PurchasePage.js';
import { SalePage } from '../pages/sales/SalePage.js';
import { SettingsPage } from '../pages/settings/SettingsPage.js';

type Tab = 'sales' | 'items' | 'suppliers' | 'purchases' | 'customerBalances' | 'settings';

export function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('sales');

  return (
    <div>
      <nav>
        <button
          type="button"
          disabled={tab === 'sales'}
          onClick={() => {
            setTab('sales');
          }}
        >
          Sales
        </button>{' '}
        <button
          type="button"
          disabled={tab === 'items'}
          onClick={() => {
            setTab('items');
          }}
        >
          Items
        </button>{' '}
        <button
          type="button"
          disabled={tab === 'suppliers'}
          onClick={() => {
            setTab('suppliers');
          }}
        >
          Suppliers
        </button>{' '}
        <button
          type="button"
          disabled={tab === 'purchases'}
          onClick={() => {
            setTab('purchases');
          }}
        >
          Purchases
        </button>{' '}
        <button
          type="button"
          disabled={tab === 'customerBalances'}
          onClick={() => {
            setTab('customerBalances');
          }}
        >
          Customer Balances
        </button>{' '}
        <button
          type="button"
          disabled={tab === 'settings'}
          onClick={() => {
            setTab('settings');
          }}
        >
          Settings
        </button>
      </nav>
      <hr />
      {tab === 'sales' && <SalePage />}
      {tab === 'items' && <ItemsPage />}
      {tab === 'suppliers' && <SuppliersPage />}
      {tab === 'purchases' && <PurchasePage />}
      {tab === 'customerBalances' && <CustomersImportPage />}
      {tab === 'settings' && <SettingsPage />}
    </div>
  );
}
