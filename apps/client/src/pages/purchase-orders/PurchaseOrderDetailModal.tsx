import { useEffect, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Alert, Button, ConfirmDialog, LoadingState, Modal, useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import type { GrnSummary, PurchaseOrderRecord } from '../../types/electron-api.js';
import { PurchaseOrderStatusBadge } from '../../components/shared/PurchaseOrderStatusBadge.js';
import { PoDetailGrnsSection } from './PoDetailGrnsSection.js';
import { PoDetailLinesTable } from './PoDetailLinesTable.js';

export interface PurchaseOrderDetailModalProps {
  readonly open: boolean;
  readonly purchaseOrderId: string | null;
  /** Resolved server-side on the list row (PurchaseOrderSummary) — PurchaseOrderRecord itself has no supplier name, only supplierPartyId, and there is no party.getById channel to resolve it here. */
  readonly supplierName: string | null;
  /** Bump this from the parent after a GRN is created/cancelled elsewhere to force a reload of this PO's lines/GRN list. */
  readonly refreshKey?: number;
  readonly onClose: () => void;
  readonly onCancelled: () => void;
  readonly onNewGrn: (po: PurchaseOrderRecord) => void;
  readonly onUploadGrnCsv: (po: PurchaseOrderRecord) => void;
  readonly onViewGrn: (grnId: string) => void;
}

const CANCELLABLE_STATUSES = new Set(['draft', 'sent']);
// P9C: widened to also exclude draft — goods cannot have arrived if the
// order was never sent, so neither manual GRN entry nor CSV upload makes
// sense for a draft PO. Applies to both "New GRN" and "Upload GRN CSV".
const GRN_ALLOWED_STATUSES_EXCLUDED = new Set(['draft', 'fully_received', 'cancelled']);

export function PurchaseOrderDetailModal({
  open,
  purchaseOrderId,
  supplierName,
  refreshKey,
  onClose,
  onCancelled,
  onNewGrn,
  onUploadGrnCsv,
  onViewGrn,
}: PurchaseOrderDetailModalProps): React.JSX.Element {
  const { showToast } = useToast();
  const [po, setPo] = useState<PurchaseOrderRecord | null>(null);
  const [grns, setGrns] = useState<readonly GrnSummary[] | null>(null);
  const [items, setItems] = useState<readonly ItemDto[] | null>(null);
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function load(id: string): void {
    setPo(null);
    setGrns(null);
    setError(null);
    ipc.purchaseOrder
      .get({ id })
      .then(setPo)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load purchase order');
      });
    ipc.grn
      .listForPO({ purchaseOrderId: id })
      .then(setGrns)
      .catch(() => {
        setGrns([]);
      });
  }

  useEffect(() => {
    if (open && purchaseOrderId) {
      load(purchaseOrderId);
      ipc.item
        .search({ query: '', categoryId: null })
        .then(setItems)
        .catch(() => {
          setItems(null);
        });
      ipc.item
        .lookups()
        .then(setLookups)
        .catch(() => {
          setLookups(null);
        });
    }
  }, [open, purchaseOrderId, refreshKey]);

  function handleCancel(): void {
    if (!po) return;
    setCancelling(true);
    ipc.purchaseOrder
      .cancel({ id: po.id })
      .then(() => {
        showToast({ variant: 'success', message: 'Purchase order cancelled' });
        setConfirmCancelOpen(false);
        onCancelled();
        onClose();
      })
      .catch((err: unknown) => {
        showToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to cancel purchase order',
        });
      })
      .finally(() => {
        setCancelling(false);
      });
  }

  return (
    <>
      <Modal
        open={open}
        title={po ? `Purchase Order ${po.docNo}` : 'Purchase Order'}
        onClose={onClose}
        size="wide"
      >
        {error && <Alert variant="danger">{error}</Alert>}
        {!po ? (
          <LoadingState message="Loading purchase order…" />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-ink-muted">
                  Supplier:{' '}
                  <span className="text-ink">{supplierName ?? po.supplierNote ?? '—'}</span>
                </p>
                <p className="text-sm text-ink-muted">Order date: {po.orderDate}</p>
                <p className="text-sm text-ink-muted">
                  Expected delivery: {po.expectedDelivery ?? '—'}
                </p>
                {po.notes && <p className="text-sm text-ink-muted">Notes: {po.notes}</p>}
              </div>
              <PurchaseOrderStatusBadge status={po.status} />
            </div>

            <PoDetailLinesTable lines={po.lines} items={items} lookups={lookups} />

            <PoDetailGrnsSection
              grns={grns}
              canCreateGrn={!GRN_ALLOWED_STATUSES_EXCLUDED.has(po.status)}
              onNewGrn={() => {
                onNewGrn(po);
              }}
              onUploadCsv={() => {
                onUploadGrnCsv(po);
              }}
              onViewGrn={onViewGrn}
            />

            {CANCELLABLE_STATUSES.has(po.status) && (
              <div className="flex justify-end border-t border-line pt-4">
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmCancelOpen(true);
                  }}
                >
                  Cancel purchase order
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmCancelOpen}
        title="Cancel purchase order?"
        confirmLabel="Cancel order"
        cancelLabel="Keep it"
        confirmVariant="danger"
        onConfirm={handleCancel}
        onCancel={() => {
          setConfirmCancelOpen(false);
        }}
      >
        This will cancel {po?.docNo}. This cannot be undone.
        {cancelling && ' Cancelling…'}
      </ConfirmDialog>
    </>
  );
}
