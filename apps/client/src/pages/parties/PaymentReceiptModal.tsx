import { useEffect, useState } from 'react';
import type { PaymentReceiptDataDto } from '@shop/contracts';
import {
  Alert,
  DocumentFooter,
  DocumentHeader,
  DocumentSection,
  LoadingState,
  Modal,
  Button,
  MoneyDisplay,
  useToast,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

export interface PaymentReceiptModalProps {
  readonly paymentId: string | null;
  readonly onClose: () => void;
}

/** CL-7E. Opens from a customer ledger payment row — receipt preview + print/reprint. */
export function PaymentReceiptModal({
  paymentId,
  onClose,
}: PaymentReceiptModalProps): React.JSX.Element | null {
  const { showToast } = useToast();
  const [data, setData] = useState<PaymentReceiptDataDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paymentId === null) {
      setData(null);
      setError(null);
      return;
    }
    ipc.payment
      .getReceipt(paymentId)
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load receipt');
      });
  }, [paymentId]);

  if (paymentId === null) return null;

  async function handlePrint(): Promise<void> {
    if (paymentId === null) return;
    const result = await ipc.print.printPaymentReceipt(paymentId);
    if (result.printError) showToast({ variant: 'error', message: result.printError });
  }

  return (
    <Modal open title="Payment receipt" onClose={onClose}>
      {error && <Alert variant="danger">{error}</Alert>}
      {!error && data === null && <LoadingState />}
      {data && (
        <div className="flex flex-col gap-5">
          <DocumentHeader layout="row" />

          <DocumentSection title="Receipt" layout="grid-2">
            <p className="text-ink">{data.docNo}</p>
            <p className="text-right text-ink-muted">{data.paymentDate}</p>
          </DocumentSection>

          <DocumentSection title="Customer">
            <p className="text-ink">
              {data.customerName} <span className="text-ink-faint">({data.customerCode})</span>
            </p>
            {data.customerPhone && <p className="text-sm text-ink-muted">{data.customerPhone}</p>}
          </DocumentSection>

          <div className="flex flex-col items-center gap-1 rounded-lg bg-success-subtle py-6">
            <p className="text-sm text-ink-muted">Amount received</p>
            <MoneyDisplay paisaValue={data.amountPaisa} tone="positive" size="xl" />
            <p className="text-sm capitalize text-ink-muted">{data.method}</p>
            {data.referenceNo && <p className="text-xs text-ink-faint">{data.referenceNo}</p>}
          </div>

          <DocumentSection title="Account summary">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Previous balance</span>
              <MoneyDisplay paisaValue={data.previousBalancePaisa} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Amount received</span>
              <MoneyDisplay paisaValue={-data.amountPaisa} tone="positive" />
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Remaining balance</span>
              <MoneyDisplay
                paisaValue={data.remainingBalancePaisa}
                tone={data.remainingBalancePaisa > 0 ? 'due' : 'positive'}
              />
            </div>
          </DocumentSection>

          <DocumentFooter />

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                void handlePrint();
              }}
            >
              Print receipt
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
