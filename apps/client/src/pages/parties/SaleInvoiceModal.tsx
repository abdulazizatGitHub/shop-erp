import { useEffect, useState } from 'react';
import type { SaleWithLinesDto } from '@shop/contracts';
import {
  Alert,
  Badge,
  Button,
  DocumentFooter,
  DocumentHeader,
  DocumentSection,
  LoadingState,
  Modal,
  MoneyDisplay,
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

export interface SaleInvoiceModalProps {
  readonly saleId: string | null;
  readonly onClose: () => void;
}

/** CL-6. Opens from a customer ledger sale row — full invoice preview + print. */
export function SaleInvoiceModal({
  saleId,
  onClose,
}: SaleInvoiceModalProps): React.JSX.Element | null {
  const { showToast } = useToast();
  const [data, setData] = useState<SaleWithLinesDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saleId === null) {
      setData(null);
      setError(null);
      return;
    }
    ipc.sale
      .getWithLines({ id: saleId })
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load invoice');
      });
  }, [saleId]);

  if (saleId === null) return null;

  async function handlePrint(): Promise<void> {
    if (saleId === null) return;
    const result = await ipc.invoice.printSaleInvoice(saleId);
    if (result.printError) showToast({ variant: 'error', message: result.printError });
  }

  return (
    <Modal open title="Sale invoice" onClose={onClose} size="wide">
      {error && <Alert variant="danger">{error}</Alert>}
      {!error && data === null && <LoadingState />}
      {data && (
        <div className="flex flex-col gap-5">
          <DocumentHeader
            layout="row"
            slots={{
              extra: (
                <div className="text-right">
                  <p className="text-sm font-medium text-ink">{data.docNo}</p>
                  <p className="text-xs text-ink-muted">{data.saleDate}</p>
                  <Badge tone={data.balanceDuePaisa > 0 ? 'warning' : 'success'}>
                    {data.balanceDuePaisa > 0 ? 'Balance due' : 'Paid'}
                  </Badge>
                </div>
              ),
            }}
          />

          <DocumentSection title="Customer" layout="grid-2">
            <p className="text-ink">{data.customerName ?? 'Walk-in'}</p>
            <div className="text-right text-sm text-ink-muted">
              {data.customerPhone && <p>{data.customerPhone}</p>}
            </div>
          </DocumentSection>

          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Qty</TableHeaderCell>
                <TableHeaderCell className="text-right">Unit price</TableHeaderCell>
                <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.lines.map((line, index) => (
                // sale_line has no stable id exposed here — index is fine for a read-only print preview
                <TableRow key={`${line.itemName}-${String(index)}`}>
                  <TableCell>{line.itemName}</TableCell>
                  <TableCell>
                    <QuantityDisplay quantityMilli={line.quantityMilli} unitLabel={line.unitName} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyDisplay paisaValue={line.unitPricePaisa} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyDisplay paisaValue={line.lineTotalPaisa} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col items-end gap-1 border-t border-line pt-3">
            <div className="flex w-64 justify-between text-sm text-ink-muted">
              <span>Total</span>
              <MoneyDisplay paisaValue={data.totalAmountPaisa} size="lg" />
            </div>
            <div className="flex w-64 justify-between text-sm text-ink-muted">
              <span>Paid so far</span>
              <MoneyDisplay paisaValue={data.paidAmountPaisa} />
            </div>
            <div className="flex w-64 justify-between text-base font-semibold">
              <span>Balance due</span>
              <MoneyDisplay
                paisaValue={data.balanceDuePaisa}
                tone={data.balanceDuePaisa > 0 ? 'due' : 'positive'}
                size="lg"
              />
            </div>
          </div>

          <DocumentFooter />

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                void handlePrint();
              }}
            >
              Print invoice
            </Button>
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
