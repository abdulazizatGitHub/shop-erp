import { useEffect, useState } from 'react';
import {
  Alert,
  EmptyState,
  LoadingState,
  Modal,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import type { ItemPriceHistoryRecord } from '../../types/electron-api.js';

export interface ItemPriceHistoryModalProps {
  readonly open: boolean;
  readonly itemId: string | null;
  readonly itemName: string | null;
  readonly onClose: () => void;
}

const PRICE_TYPE_LABEL: Record<string, string> = {
  purchase_cost: 'Purchase Cost',
  retail: 'Retail',
  wholesale: 'Wholesale',
};

function sourceLabel(sourceType: string, sourceId: string): string {
  if (sourceType === 'grn') return `GRN ${sourceId}`;
  return `${sourceType} ${sourceId}`;
}

export function ItemPriceHistoryModal({
  open,
  itemId,
  itemName,
  onClose,
}: ItemPriceHistoryModalProps): React.JSX.Element {
  const [rows, setRows] = useState<readonly ItemPriceHistoryRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemId) return;
    setRows(null);
    setError(null);
    ipc.item
      .priceHistory({ itemId })
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load price history');
      });
  }, [open, itemId]);

  return (
    <Modal
      open={open}
      title={itemName ? `Price History — ${itemName}` : 'Price History'}
      onClose={onClose}
    >
      {error && <Alert variant="danger">{error}</Alert>}
      {rows === null ? (
        <LoadingState message="Loading price history…" />
      ) : rows.length === 0 ? (
        <EmptyState message="No price changes recorded yet for this item." />
      ) : (
        <Table>
          <TableHead>
            <TableRow zebra={false} hover="neutral">
              <TableHeaderCell className="tracking-wide text-ink-faint">Date</TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Type</TableHeaderCell>
              <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                Old price
              </TableHeaderCell>
              <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                New price
              </TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Source</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} zebra={false} hover="neutral">
                <TableCell className="py-2">{row.changedAt}</TableCell>
                <TableCell className="py-2">
                  {PRICE_TYPE_LABEL[row.priceType] ?? row.priceType}
                </TableCell>
                <TableCell className="py-2 text-right">
                  <span className="text-ink-faint line-through">
                    <MoneyDisplay paisaValue={row.oldValuePaisa} />
                  </span>
                </TableCell>
                <TableCell className="py-2 text-right">
                  <MoneyDisplay paisaValue={row.newValuePaisa} />
                </TableCell>
                <TableCell className="py-2">{sourceLabel(row.sourceType, row.sourceId)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Modal>
  );
}
