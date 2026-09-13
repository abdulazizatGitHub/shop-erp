import { useEffect, useState } from 'react';
import type { ItemDto } from '@shop/contracts';
import { Alert, Button, ConfirmDialog, LoadingState, Modal, useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import type { GrnRecord } from '../../types/electron-api.js';
import { GrnStatusBadge } from '../../components/shared/GrnStatusBadge.js';
import { GrnDetailLinesTable } from './GrnDetailLinesTable.js';

export interface GrnDetailModalProps {
  readonly open: boolean;
  readonly grnId: string | null;
  readonly poDocNo: string | null;
  readonly onClose: () => void;
  readonly onCancelled: () => void;
  readonly onBackToPo: () => void;
}

export function GrnDetailModal({
  open,
  grnId,
  poDocNo,
  onClose,
  onCancelled,
  onBackToPo,
}: GrnDetailModalProps): React.JSX.Element {
  const { showToast } = useToast();
  const [grn, setGrn] = useState<GrnRecord | null>(null);
  const [items, setItems] = useState<readonly ItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!open || !grnId) return;
    setGrn(null);
    setError(null);
    ipc.grn
      .get({ id: grnId })
      .then(setGrn)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load GRN');
      });
    ipc.item
      .search({ query: '', categoryId: null })
      .then(setItems)
      .catch(() => {
        setItems(null);
      });
  }, [open, grnId]);

  function handleCancel(): void {
    if (!grn) return;
    setCancelling(true);
    ipc.grn
      .cancel({ id: grn.id })
      .then(() => {
        showToast({ variant: 'success', message: 'GRN cancelled — stock reversed' });
        setConfirmCancelOpen(false);
        onCancelled();
        onClose();
      })
      .catch((err: unknown) => {
        showToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to cancel GRN',
        });
      })
      .finally(() => {
        setCancelling(false);
      });
  }

  return (
    <>
      <Modal open={open} title={grn ? `GRN ${grn.docNo}` : 'GRN'} onClose={onClose} size="wide">
        {error && <Alert variant="danger">{error}</Alert>}
        {!grn ? (
          <LoadingState message="Loading GRN…" />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-ink-muted">
                  Purchase order:{' '}
                  <button type="button" onClick={onBackToPo} className="text-brand hover:underline">
                    {poDocNo ?? grn.purchaseOrderId}
                  </button>
                </p>
                <p className="text-sm text-ink-muted">Date: {grn.grnDate}</p>
                <p className="text-sm text-ink-muted">
                  Supplier bill ref: {grn.supplierBillRef ?? '—'}
                </p>
                <p className="text-sm text-ink-muted capitalize">Payment mode: {grn.paymentMode}</p>
                {grn.notes && <p className="text-sm text-ink-muted">Notes: {grn.notes}</p>}
              </div>
              <GrnStatusBadge status={grn.status} />
            </div>

            <GrnDetailLinesTable lines={grn.lines} items={items} />

            {grn.status === 'confirmed' && (
              <div className="flex justify-end border-t border-line pt-4">
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmCancelOpen(true);
                  }}
                >
                  Cancel GRN
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmCancelOpen}
        title="Cancel this GRN?"
        confirmLabel="Cancel GRN"
        cancelLabel="Keep it"
        confirmVariant="danger"
        onConfirm={handleCancel}
        onCancel={() => {
          setConfirmCancelOpen(false);
        }}
      >
        Cancelling this GRN will reverse the stock movement and supplier ledger entry. This cannot
        be undone.
        {cancelling && ' Cancelling…'}
      </ConfirmDialog>
    </>
  );
}
