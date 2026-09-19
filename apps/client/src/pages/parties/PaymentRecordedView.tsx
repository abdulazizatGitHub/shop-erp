import type { PaymentDto } from '@shop/contracts';
import { Alert, Button, Modal } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

export interface PaymentRecordedViewProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly successResult: PaymentDto;
  readonly onPrintError: (message: string) => void;
}

/**
 * CL-7F success state, split out of RecordPaymentModal.tsx to keep that
 * file under the 300-line cap. Shown instead of the form once a payment
 * has been recorded — Print receipt + Done, never auto-closes.
 */
export function PaymentRecordedView({
  open,
  onClose,
  successResult,
  onPrintError,
}: PaymentRecordedViewProps): React.JSX.Element {
  async function handlePrintReceipt(): Promise<void> {
    const result = await ipc.print.printPaymentReceipt(successResult.id);
    if (result.printError) onPrintError(result.printError);
  }

  return (
    <Modal open={open} title="Payment recorded" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Alert variant="success">Payment recorded — {successResult.docNo}</Alert>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              void handlePrintReceipt();
            }}
          >
            Print receipt
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
