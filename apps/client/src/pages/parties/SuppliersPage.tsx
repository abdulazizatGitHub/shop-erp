import { useState } from 'react';
import { Alert, Button, PageHeader } from '@shop/ui';
import { AddSupplierModal } from './AddSupplierModal.js';
import { ImportSuppliersModal } from './ImportSuppliersModal.js';
import { SupplierListView } from './SupplierListView.js';

export function SuppliersPage(): React.JSX.Element {
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Remounts SupplierListView after a create/import, forcing a fresh
  // load — simpler than lifting the supplier list up into this component.
  const [listVersion, setListVersion] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Suppliers"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setImportOpen(true);
              }}
            >
              Import Balances
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAddOpen(true);
              }}
            >
              Add Supplier
            </Button>
          </>
        }
      />

      {message && <Alert variant="success">{message}</Alert>}

      <SupplierListView key={listVersion} />

      <AddSupplierModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
        }}
        onCreated={(partyCode) => {
          setAddOpen(false);
          setMessage(`Supplier created: ${partyCode}`);
          setListVersion((v) => v + 1);
        }}
      />

      <ImportSuppliersModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
        onImported={() => {
          setListVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
