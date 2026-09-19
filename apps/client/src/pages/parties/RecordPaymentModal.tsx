import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { CreatePaymentInput, PaymentDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Button, Modal, MoneyDisplay, TextInput, useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { PaymentMethodToggle } from './PaymentMethodToggle.js';
import { PaymentRecordedView } from './PaymentRecordedView.js';

type PaymentMethod = CreatePaymentInput['method'];

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
 * No customer search here — the caller (CustomerDetailPage) already knows
 * which customer triggered this, so partyId/customerName/currentBalancePaisa
 * arrive as props instead of being re-looked-up.
 *
 * CL-7F: on success, shows a success state with the doc number and a
 * "Print receipt" button rather than closing immediately — the caller's
 * onPaid is still called (to refresh balance/ledger) but does not close
 * the modal; only the "Done" button (via onClose) does.
 */
export function RecordPaymentModal({
  open,
  onClose,
  partyId,
  customerName,
  currentBalancePaisa,
  onPaid,
}: RecordPaymentModalProps): React.JSX.Element | null {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successResult, setSuccessResult] = useState<PaymentDto | null>(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setError(null);
      setBusy(false);
      setSuccessResult(null);
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
      setSuccessResult(result);
      onPaid(result);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    }
  }

  if (successResult) {
    return (
      <PaymentRecordedView
        open={open}
        onClose={onClose}
        successResult={successResult}
        onPrintError={(message) => {
          showToast({ variant: 'error', message });
        }}
      />
    );
  }

  return (
    <Modal open={open} title="Record payment" onClose={onClose} size="wide">
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {/* 5A — customer context, visually separated from the form fields below. */}
        <div className="rounded-lg border border-line bg-surface-sunken px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-muted">
                Recording payment for
              </p>
              <p className="text-base font-medium text-ink">{customerName}</p>
            </div>
            <div className="text-right">
              <p className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-muted">
                Current balance
              </p>
              <MoneyDisplay paisaValue={currentBalancePaisa} tone="due" size="xl" />
              <p className="mt-0.5 text-caption text-ink-muted">Outstanding udhaar</p>
            </div>
          </div>
        </div>

        <div className="border-t border-line" />

        <div className="grid grid-cols-2 gap-6 mt-4">
          <PaymentMethodToggle
            value={form.method}
            onChange={(method) => {
              setForm((prev) => ({ ...prev, method }));
            }}
          />

          <div className="space-y-4">
            {/* 5B — amount with an Rs prefix, plus a pay-full-balance quick-fill. */}
            <div>
              <label
                className="mb-1.5 block text-sm font-medium text-ink-muted"
                htmlFor="payment-amount"
              >
                Amount received *
              </label>
              <div className="flex items-center overflow-hidden rounded-md border border-line focus-within:border-brand focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus">
                <span className="select-none border-r border-line bg-surface-sunken px-3 py-2 text-sm font-medium text-ink-muted">
                  Rs
                </span>
                <input
                  id="payment-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="0"
                  autoFocus
                  value={form.amount}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, amount: e.target.value }));
                  }}
                  className="flex-1 bg-transparent px-3 py-2 text-base font-medium text-ink outline-none"
                />
              </div>
              {currentBalancePaisa > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      amount: String(Math.round(currentBalancePaisa / 100)),
                    }));
                  }}
                  className="mt-1.5 text-xs text-brand hover:underline"
                >
                  Pay full balance (Rs {Math.round(currentBalancePaisa / 100).toLocaleString()})
                </button>
              )}
            </div>

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
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <Button
            variant="primary"
            size="large"
            disabled={busy}
            onClick={() => {
              void handleSubmit();
            }}
          >
            <Check size={16} aria-hidden="true" />
            {busy ? 'Saving…' : 'Save payment'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
