import { useEffect, useState } from 'react';
import type { PurchaseOrderRecord, PurchaseOrderSummary } from '../../types/electron-api.js';
import { Button, LoadingState, PageHeader, useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { GrnDetailModal } from './GrnDetailModal.js';
import { NewGrnModal } from './NewGrnModal.js';
import { NewPoModal } from './NewPoModal.js';
import { PurchaseOrderDetailModal } from './PurchaseOrderDetailModal.js';
import { PurchaseOrdersTable } from './PurchaseOrdersTable.js';

export function PurchaseOrdersPage(): React.JSX.Element {
  const { showToast } = useToast();
  const [rows, setRows] = useState<readonly PurchaseOrderSummary[] | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [newPoOpen, setNewPoOpen] = useState(false);
  const [viewingRow, setViewingRow] = useState<PurchaseOrderSummary | null>(null);
  const [newGrnPo, setNewGrnPo] = useState<PurchaseOrderRecord | null>(null);
  const [viewingGrnId, setViewingGrnId] = useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  function loadPurchaseOrders(): void {
    ipc.purchaseOrder
      .list()
      .then(setRows)
      .catch((err: unknown) => {
        showToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to load purchase orders',
        });
      });
  }

  useEffect(() => {
    loadPurchaseOrders();
  }, []);

  function handleView(row: PurchaseOrderSummary): void {
    setViewingRow(row);
  }

  function handleCancel(id: string): void {
    setCancellingId(id);
    ipc.purchaseOrder
      .cancel({ id })
      .then(() => {
        showToast({ variant: 'success', message: 'Purchase order cancelled' });
        loadPurchaseOrders();
      })
      .catch((err: unknown) => {
        showToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to cancel purchase order',
        });
      })
      .finally(() => {
        setCancellingId(null);
      });
  }

  return (
    <div className="flex min-h-full flex-col gap-6 bg-surface-page">
      <PageHeader
        title="Purchase Orders"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setNewPoOpen(true);
            }}
          >
            New Purchase Order
          </Button>
        }
      />
      <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
        {rows === null ? (
          <LoadingState message="Loading purchase orders…" />
        ) : (
          <PurchaseOrdersTable
            rows={rows}
            cancellingId={cancellingId}
            onView={handleView}
            onCancel={handleCancel}
          />
        )}
      </div>

      <NewPoModal
        open={newPoOpen}
        onClose={() => {
          setNewPoOpen(false);
        }}
        onCreated={(docNo) => {
          showToast({ variant: 'success', message: `Purchase Order ${docNo} recorded` });
          loadPurchaseOrders();
        }}
      />

      <PurchaseOrderDetailModal
        open={viewingRow !== null}
        purchaseOrderId={viewingRow?.id ?? null}
        supplierName={viewingRow?.supplierName ?? null}
        refreshKey={detailRefreshKey}
        onClose={() => {
          setViewingRow(null);
        }}
        onCancelled={loadPurchaseOrders}
        onNewGrn={(po) => {
          setNewGrnPo(po);
        }}
        onViewGrn={(grnId) => {
          setViewingGrnId(grnId);
        }}
      />

      <NewGrnModal
        open={newGrnPo !== null}
        po={newGrnPo}
        onClose={() => {
          setNewGrnPo(null);
        }}
        onCreated={(docNo) => {
          showToast({ variant: 'success', message: `GRN ${docNo} recorded — stock updated` });
          setNewGrnPo(null);
          loadPurchaseOrders();
          setDetailRefreshKey((k) => k + 1);
        }}
      />

      <GrnDetailModal
        open={viewingGrnId !== null}
        grnId={viewingGrnId}
        poDocNo={viewingRow?.docNo ?? null}
        onClose={() => {
          setViewingGrnId(null);
        }}
        onCancelled={() => {
          loadPurchaseOrders();
          setDetailRefreshKey((k) => k + 1);
        }}
        onBackToPo={() => {
          setViewingGrnId(null);
        }}
      />
    </div>
  );
}
