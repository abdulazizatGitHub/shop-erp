import { useState } from 'react';
import { Button, PageHeader, useToast } from '@shop/ui';
import { AddSupplierModal } from './AddSupplierModal.js';
import { ImportSuppliersModal } from './ImportSuppliersModal.js';
import { SupplierListView } from './SupplierListView.js';

export function SuppliersPage(): React.JSX.Element {
  const { showToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Remounts SupplierListView after a create/import, forcing a fresh
  // load — simpler than lifting the supplier list up into this component.
  const [listVersion, setListVersion] = useState(0);

  return (
    <div className="flex min-h-full flex-col gap-6 bg-surface-page">
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

      {/* Plain div, not the shared Card primitive — same reasoning as
          ItemsPage.tsx (Card has no className override, used by 11 other
          screens). See PROJECT.md §2.5. */}
      <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
        <SupplierListView key={listVersion} />
      </div>

      <AddSupplierModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
        }}
        onCreated={(partyCode) => {
          setAddOpen(false);
          showToast({ variant: 'success', message: `Supplier created: ${partyCode}` });
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
