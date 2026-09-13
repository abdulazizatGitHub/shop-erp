import { useState } from 'react';
import type { PurchaseOrderSummary } from '../../types/electron-api.js';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { PurchaseOrderStatusBadge } from '../../components/shared/PurchaseOrderStatusBadge.js';

export interface PurchaseOrdersTableProps {
  readonly rows: readonly PurchaseOrderSummary[];
  readonly cancellingId: string | null;
  readonly onView: (row: PurchaseOrderSummary) => void;
  readonly onCancel: (id: string) => void;
}

/** Draft/sent are the only statuses a PO can still be cancelled from (once a GRN confirms, cancel is refused server-side). */
function canCancel(status: string): boolean {
  return status === 'draft' || status === 'sent';
}

export function PurchaseOrdersTable({
  rows,
  cancellingId,
  onView,
  onCancel,
}: PurchaseOrdersTableProps): React.JSX.Element {
  const [pendingCancel, setPendingCancel] = useState<PurchaseOrderSummary | null>(null);

  if (rows.length === 0) {
    return <EmptyState message="No purchase orders yet." hint="Create one to get started." />;
  }

  return (
    <>
      <Table>
        <TableHead>
          <TableRow zebra={false} hover="neutral">
            <TableHeaderCell className="tracking-wide text-ink-faint">Doc No</TableHeaderCell>
            <TableHeaderCell className="tracking-wide text-ink-faint">Supplier</TableHeaderCell>
            <TableHeaderCell className="tracking-wide text-ink-faint">Date</TableHeaderCell>
            <TableHeaderCell className="tracking-wide text-ink-faint">Status</TableHeaderCell>
            <TableHeaderCell className="text-right tracking-wide text-ink-faint">
              Ordered
            </TableHeaderCell>
            <TableHeaderCell className="text-right tracking-wide text-ink-faint">
              Received
            </TableHeaderCell>
            <TableHeaderCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} zebra={false} hover="neutral">
              <TableCell className="py-3">{row.docNo}</TableCell>
              <TableCell className="py-3">{row.supplierName ?? '—'}</TableCell>
              <TableCell className="py-3">{row.orderDate}</TableCell>
              <TableCell className="py-3">
                <PurchaseOrderStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="py-3 text-right">
                <QuantityDisplay quantityMilli={row.totalOrderedMilli} />
              </TableCell>
              <TableCell className="py-3 text-right">
                <QuantityDisplay quantityMilli={row.totalReceivedMilli} />
              </TableCell>
              <TableCell className="py-3">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onView(row);
                    }}
                  >
                    View
                  </Button>
                  {canCancel(row.status) && (
                    <Button
                      variant="danger"
                      disabled={cancellingId === row.id}
                      onClick={() => {
                        setPendingCancel(row);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={pendingCancel !== null}
        title="Cancel purchase order?"
        confirmLabel="Cancel order"
        cancelLabel="Keep it"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingCancel) onCancel(pendingCancel.id);
          setPendingCancel(null);
        }}
        onCancel={() => {
          setPendingCancel(null);
        }}
      >
        This will cancel {pendingCancel?.docNo}. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
