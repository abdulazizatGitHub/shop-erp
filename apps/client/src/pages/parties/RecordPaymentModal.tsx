import { useEffect, useState } from 'react';
import type { CreatePaymentInput, PaymentDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Button, Modal, MoneyDisplay, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

type PaymentMethod = CreatePaymentInput['method'];

const PAYMENT_METHODS: ReadonlyArray<{ readonly value: PaymentMethod; readonly label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'cheque', label: 'Cheque' },
];

interface FormState {
  readonly amount: string;
  readonly method: PaymentMethod;
  readonly paymentDate: string;
  readonly referenceNo: string;
  readonly notes: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return { amount: '', method: 'cash', paymentDate: todayIso(), referenceNo: '', notes: '' };
}

/** '' on a text input means "not entered" — CreatePaymentInput wants null there, not ''. Same pattern as AddSupplierModal.tsx. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface RecordPaymentModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly partyId: string;
  readonly customerName: string;
  readonly currentBalancePaisa: number;
  /** Called once after a successful create, so the caller can refresh just this customer's balance. */
  readonly onPaid: (result: PaymentDto) => void;
}

/**
 * BUG-NEW3 fix (CRITICAL) — payment:receive was fully wired server-side
 * (handler, preload, contract) but had zero call sites in the client.
 * This is the first one. Structural pattern copied from AddSupplierModal.tsx
 * (open/onClose/onX props, reset-on-open, blankToNull, try/catch submit).
 * No customer search here — the caller (CustomerListView) already knows
 * which row triggered this, so partyId/customerName/currentBalancePaisa
 * arrive as props instead of being re-looked-up.
 */
export function RecordPaymentModal({
  open,
  onClose,
  partyId,
  customerName,
  currentBalancePaisa,
  onPaid,
}: RecordPaymentModalProps): React.JSX.Element | null {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(): Promise<void> {
    setError(null);

    const trimmedAmount = form.amount.trim();
    if (trimmedAmount.length === 0) {
      setError('Amount is required');
      return;
    }

    let amountPaisa: number;
    try {
      amountPaisa = Money.fromRupees(trimmedAmount);
    } catch {
      setError('Enter a valid amount');
      return;
    }
    if (amountPaisa < 1) {
      setError('Amount must be greater than zero');
      return;
    }

    const input: CreatePaymentInput = {
      partyId,
      amountPaisa,
      method: form.method,
      paymentDate: form.paymentDate,
      referenceNo: blankToNull(form.referenceNo),
      notes: blankToNull(form.notes),
    };

    setBusy(true);
    try {
      const result = await ipc.payment.receive(input);
      setBusy(false);
      onPaid(result);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    }
  }

  return (
    <Modal open={open} title="Record payment" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
          <p className="text-sm text-ink-muted">Customer</p>
          <p className="text-base font-medium text-ink">{customerName}</p>
          <p className="mt-2 text-sm text-ink-muted">Current balance</p>
          <MoneyDisplay paisaValue={currentBalancePaisa} tone="due" />
        </div>

        <TextInput
          label="Amount (Rs)"
          variant="number"
          autoFocus
          required
          value={form.amount}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, amount: e.target.value }));
          }}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Payment Method"
            value={form.method}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, method: e.target.value as PaymentMethod }));
            }}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>

          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            Payment date
            <input
              type="date"
              value={form.paymentDate}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, paymentDate: e.target.value }));
              }}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
            />
          </label>
        </div>

        <TextInput
          label="Reference No. (optional)"
          value={form.referenceNo}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, referenceNo: e.target.value }));
          }}
        />
        <TextInput
          label="Notes (optional)"
          value={form.notes}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, notes: e.target.value }));
          }}
        />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
