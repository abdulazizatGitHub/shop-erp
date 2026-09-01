import { useState } from 'react';
import { Alert, Button, PageHeader } from '@shop/ui';
import { CustomerListView } from './CustomerListView.js';
import { ImportCustomersModal } from './ImportCustomersModal.js';

/** P4.5-8, updated for the import-modal pass: import moved from an inline card into a modal. */
export function CustomersPage(): React.JSX.Element {
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Remounts CustomerListView after an import, forcing a fresh load —
  // same pattern as SuppliersPage.
  const [listVersion, setListVersion] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setImportOpen(true);
            }}
          >
            Import Balances
          </Button>
        }
      />

      {message && <Alert variant="success">{message}</Alert>}

      <CustomerListView key={listVersion} />

      <ImportCustomersModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
        onImported={() => {
          setMessage('Customer balances imported.');
          setListVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
