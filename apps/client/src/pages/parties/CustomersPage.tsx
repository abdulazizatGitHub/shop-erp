import { useState } from 'react';
import { Upload, UserPlus } from 'lucide-react';
import { Alert, Button, PageHeader } from '@shop/ui';
import { AddCustomerModal } from './AddCustomerModal.js';
import { CustomerDetailPage } from './CustomerDetailPage.js';
import { CustomerListView } from './CustomerListView.js';
import { ImportCustomersModal } from './ImportCustomersModal.js';

export interface CustomersPageProps {
  /** P14-2/OD-6: set when navigated here from a job card's customer-name
   * link (JobPropertyPanel.tsx via App.tsx) — opens straight to that
   * customer's detail view instead of the list. Read once at mount, same
   * as every other prop here; App.tsx clears it after the tab switch
   * commits so returning to Customers via the sidebar later shows the
   * list, not the same customer again. */
  readonly initialCustomerId?: string | null;
}

/**
 * P4.5-8, updated for CL-5/CL-9: import moved from an inline card into a
 * modal; row selection now drills into CustomerDetailPage instead of
 * staying on the list.
 */
export function CustomersPage({ initialCustomerId = null }: CustomersPageProps): React.JSX.Element {
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Remounts CustomerListView after an import/add, forcing a fresh load —
  // same pattern as SuppliersPage.
  const [listVersion, setListVersion] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId);

  if (selectedCustomerId) {
    return (
      <CustomerDetailPage
        customerId={selectedCustomerId}
        onBack={() => {
          setSelectedCustomerId(null);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6 bg-surface-page">
      <PageHeader
        title="Customers"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setImportOpen(true);
              }}
            >
              <Upload size={16} aria-hidden="true" />
              Import Balances
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAddOpen(true);
              }}
            >
              <UserPlus size={16} aria-hidden="true" />
              Add customer
            </Button>
          </>
        }
      />

      {message && <Alert variant="success">{message}</Alert>}

      {/* Plain div, not the shared Card primitive — same reasoning as
          SuppliersPage.tsx (Card has no className override). */}
      <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
        <CustomerListView key={listVersion} onSelectCustomer={setSelectedCustomerId} />
      </div>

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

      <AddCustomerModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
        }}
        onCreated={(partyCode) => {
          setAddOpen(false);
          setMessage(`Customer added — ${partyCode}`);
          setListVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
