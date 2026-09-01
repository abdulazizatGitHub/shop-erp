import { useState } from 'react';
import type { PurchaseListRowDto } from '@shop/contracts';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

export interface PurchaseListTableProps {
  readonly purchases: readonly PurchaseListRowDto[];
  readonly cancellingId: string | null;
  readonly onCancel: (id: string) => void;
}

/** P4.5-5 correction 2 — the real persisted list, replacing the old session-memory table. */
export function PurchaseListTable({
  purchases,
  cancellingId,
  onCancel,
}: PurchaseListTableProps): React.JSX.Element {
  // Row awaiting confirmation — Cancel opens this dialog rather than
  // calling onCancel directly, since cancelling reverses real stock/
  // ledger movements and cannot be undone.
  const [pendingCancel, setPendingCancel] = useState<PurchaseListRowDto | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  function handlePrint(id: string): void {
    setPrintingId(id);
    setPrintError(null);
    ipc.purchase
      .printOrder(id)
      .then((outcome) => {
        if (outcome.printError) setPrintError(outcome.printError);
      })
      .catch((err: unknown) => {
        setPrintError(err instanceof Error ? err.message : 'Failed to print purchase order');
      })
      .finally(() => {
        setPrintingId(null);
      });
  }

  if (purchases.length === 0) {
    return <EmptyState message="No purchases recorded yet." />;
  }

  return (
    <>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Doc No</TableHeaderCell>
            <TableHeaderCell>Supplier</TableHeaderCell>
            <TableHeaderCell>Date</TableHeaderCell>
            <TableHeaderCell>Payment</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {purchases.map((purchase) => (
            <TableRow key={purchase.id}>
              <TableCell>{purchase.docNo}</TableCell>
              <TableCell>{purchase.supplierName}</TableCell>
              <TableCell>{purchase.purchaseDate}</TableCell>
              <TableCell>
                <Badge tone={purchase.paymentMode === 'cash' ? 'success' : 'warning'}>
                  {purchase.paymentMode === 'cash' ? 'Cash' : 'Credit'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <MoneyDisplay paisaValue={purchase.totalAmountPaisa} />
              </TableCell>
              <TableCell>
                {purchase.status === 'cancelled' ? (
                  <Badge tone="danger">Cancelled</Badge>
                ) : (
                  <Badge tone="neutral">{purchase.status}</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {/* Every row, including cancelled ones — printable for records. */}
                  <Button
                    variant="secondary"
                    disabled={printingId === purchase.id}
                    onClick={() => {
                      handlePrint(purchase.id);
                    }}
                  >
                    Print
                  </Button>
                  {purchase.status !== 'cancelled' && (
                    <Button
                      variant="danger"
                      disabled={cancellingId === purchase.id}
                      onClick={() => {
                        setPendingCancel(purchase);
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

      {printError && (
        <div className="mt-3">
          <Alert
            variant="danger"
            onDismiss={() => {
              setPrintError(null);
            }}
          >
            {printError}
          </Alert>
        </div>
      )}

      <ConfirmDialog
        open={pendingCancel !== null}
        title="Cancel purchase?"
        confirmLabel="Cancel purchase"
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
        This will reverse all stock movements and ledger entries for {pendingCancel?.docNo}. This
        cannot be undone. Are you sure?
      </ConfirmDialog>
    </>
  );
}
