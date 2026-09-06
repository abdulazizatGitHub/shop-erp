import { useState } from 'react';
import { Alert, Button, PageHeader } from '@shop/ui';
import { AddStaffModal } from './AddStaffModal.js';
import { AdvancesSection } from './AdvancesSection.js';
import { StaffListView } from './StaffListView.js';

export function StaffPage(): React.JSX.Element {
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Remounts StaffListView after a create, forcing a fresh load — same
  // pattern as SuppliersPage/CustomersPage.
  const [listVersion, setListVersion] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setAddOpen(true);
            }}
          >
            Add Staff Member
          </Button>
        }
      />

      {message && <Alert variant="success">{message}</Alert>}

      <StaffListView key={listVersion} />

      <hr className="border-line" />

      <AdvancesSection key={`advances-${String(listVersion)}`} />

      <AddStaffModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
        }}
        onCreated={(partyCode) => {
          setAddOpen(false);
          setMessage(`Staff member created: ${partyCode}`);
          setListVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
