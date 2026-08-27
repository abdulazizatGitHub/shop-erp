import { useState } from 'react';
import { ItemsPage } from '../pages/items/ItemsPage.js';
import { CustomersImportPage } from '../pages/parties/CustomersImportPage.js';
import { SuppliersImportPage } from '../pages/parties/SuppliersImportPage.js';
import { SalePage } from '../pages/sales/SalePage.js';

type Tab = 'sales' | 'items' | 'suppliers' | 'customerBalances';

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
          disabled={tab === 'customerBalances'}
          onClick={() => {
            setTab('customerBalances');
          }}
        >
          Customer Balances
        </button>
      </nav>
      <hr />
      {tab === 'sales' && <SalePage />}
      {tab === 'items' && <ItemsPage />}
      {tab === 'suppliers' && <SuppliersImportPage />}
      {tab === 'customerBalances' && <CustomersImportPage />}
    </div>
  );
}
