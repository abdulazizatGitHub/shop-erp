import { useEffect, useState } from 'react';
import type { ServiceChargeAdminDto } from '@shop/contracts';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { ServiceChargeModal } from './ServiceChargeModal.js';

const COMMISSION_LABEL: Record<
  ServiceChargeAdminDto['commissionMode'],
  (c: ServiceChargeAdminDto) => string
> = {
  none: () => 'None',
  fixed: (c) => `Rs ${((c.commissionAmountPaisa ?? 0) / 100).toLocaleString('en-PK')} fixed`,
  bp: (c) => `${((c.commissionBp ?? 0) / 100).toLocaleString('en-PK')}%`,
};

/** P16-1 — Job Settings > Service Charges. Active and inactive both list here; only active ones appear in the delivery modal (lookup.repository.ts's listServiceCharges). */
export function ServiceChargesTab(): React.JSX.Element {
  const [charges, setCharges] = useState<readonly ServiceChargeAdminDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceChargeAdminDto | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load(): void {
    ipc.job
      .listServiceChargesAdmin()
      .then(setCharges)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load service charges');
      });
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate(): void {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(charge: ServiceChargeAdminDto): void {
    setEditing(charge);
    setModalOpen(true);
  }

  function handleSaved(): void {
    setModalOpen(false);
    load();
  }

  async function handleToggle(charge: ServiceChargeAdminDto): Promise<void> {
    setTogglingId(charge.id);
    setError(null);
    try {
      await ipc.job.toggleServiceCharge({ id: charge.id, isActive: !charge.isActive });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update service charge');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex justify-end">
        <Button variant="primary" onClick={openCreate}>
          + Add service charge
        </Button>
      </div>
      {charges === null && <p className="text-sm text-ink-muted">Loading…</p>}
      {charges !== null && charges.length === 0 && (
        <EmptyState
          message="No service charges yet"
          hint="Add the shop's labour charges to make them available at delivery."
        />
      )}
      {charges !== null && charges.length > 0 && (
        <Table>
          <TableHead>
            <TableRow hover="neutral">
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Job type</TableHeaderCell>
              <TableHeaderCell className="text-right">Retail</TableHeaderCell>
              <TableHeaderCell>Commission</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {charges.map((charge) => (
              <TableRow key={charge.id} hover="neutral">
                <TableCell>{charge.name}</TableCell>
                <TableCell>{charge.jobType ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={charge.retailChargePaisa} />
                </TableCell>
                <TableCell>{COMMISSION_LABEL[charge.commissionMode](charge)}</TableCell>
                <TableCell>
                  <Badge tone={charge.isActive ? 'success' : 'neutral'}>
                    {charge.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        openEdit(charge);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={togglingId === charge.id}
                      onClick={() => {
                        void handleToggle(charge);
                      }}
                    >
                      {charge.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ServiceChargeModal
        open={modalOpen}
        editing={editing}
        onClose={() => {
          setModalOpen(false);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}
