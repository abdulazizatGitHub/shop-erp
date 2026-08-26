import { useState } from 'react';
import { ItemsPage } from '../pages/items/ItemsPage.js';
import { SuppliersImportPage } from '../pages/parties/SuppliersImportPage.js';

type Tab = 'items' | 'suppliers';

export function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('items');

  return (
    <div>
      <nav>
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
        </button>
      </nav>
      <hr />
      {tab === 'items' ? <ItemsPage /> : <SuppliersImportPage />}
    </div>
  );
}
