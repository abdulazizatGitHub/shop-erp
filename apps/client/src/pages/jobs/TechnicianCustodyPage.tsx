import { useEffect, useState } from 'react';
import { Money } from '@shop/shared';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  PageHeader,
  QuantityDisplay,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import type { TechnicianCustodyRecord, TechnicianOption } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ADR-0006: reconciliation is INSERT-only, always action_taken='noted' —
 * it never deducts wages or touches stock. See custody.repository.ts. */
export default function TechnicianCustodyPage(): React.JSX.Element {
  const [technicians, setTechnicians] = useState<readonly TechnicianOption[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [rows, setRows] = useState<readonly TechnicianCustodyRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [shortageRupees, setShortageRupees] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    ipc.job
      .listTechnicians()
      .then(setTechnicians)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load technicians');
      });
  }, []);

  function loadCustody(): void {
    if (technicianId.length === 0) {
      setRows(null);
      return;
    }
    ipc.job
      .getTechnicianCustody({ technicianPartyId: technicianId })
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load custody');
      });
  }

  useEffect(loadCustody, [technicianId]);

  const warehouseId = rows && rows.length > 0 ? rows[0]?.warehouseId : null;

  async function handleReconcile(): Promise<void> {
    setConfirmOpen(false);
    if (!warehouseId) return;
    let shortageValuePaisa: number;
    try {
      shortageValuePaisa = Money.fromRupees(shortageRupees);
    } catch {
      setError('Shortage value is not a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await ipc.job.reconcileCustody({
        warehouseId,
        custodianPartyId: technicianId,
        reconciledOn: todayIso(),
        shortageValuePaisa,
        notes: notes.trim().length > 0 ? notes.trim() : null,
      });
      setNotice(
        'Shortage recorded. No wage deduction was made — that remains a separate owner action.',
      );
      setShortageRupees('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record reconciliation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Technician Custody" />

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && (
        <Alert
          variant="success"
          onDismiss={() => {
            setNotice(null);
          }}
        >
          {notice}
        </Alert>
      )}

      <Select
        label="Technician"
        value={technicianId}
        onChange={(e) => {
          setTechnicianId(e.target.value);
        }}
      >
        <option value="">Select a technician…</option>
        {technicians.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>

      {technicianId.length === 0 ? (
        <EmptyState message="Select a technician to see what they currently hold." />
      ) : rows === null ? (
        <LoadingState message="Loading custody…" />
      ) : rows.length === 0 ? (
        <EmptyState message="This technician is holding no parts right now." />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Qty Held</TableHeaderCell>
                <TableHeaderCell>Last Movement</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.itemId}>
                  <TableCell>{r.itemName}</TableCell>
                  <TableCell>
                    <QuantityDisplay quantityMilli={r.qtyHeldMilli} />
                  </TableCell>
                  <TableCell>{r.lastMovement ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">Record a shortage</p>
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                label="Shortage value (Rs)"
                variant="number"
                value={shortageRupees}
                onChange={(e) => {
                  setShortageRupees(e.target.value);
                }}
              />
              <TextInput
                label="Notes (optional)"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="warning"
                disabled={submitting || shortageRupees.trim().length === 0}
                onClick={() => {
                  setConfirmOpen(true);
                }}
              >
                Record Shortage
              </Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Record custody shortage"
        confirmVariant="warning"
        confirmLabel="Record"
        onConfirm={() => {
          void handleReconcile();
        }}
        onCancel={() => {
          setConfirmOpen(false);
        }}
      >
        This only notes the shortage — it does not deduct anything from the technician's wages or
        touch stock. Any wage deduction is a separate decision made outside this system.
      </ConfirmDialog>
    </div>
  );
}
