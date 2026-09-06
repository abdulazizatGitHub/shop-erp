import { useEffect, useState } from 'react';
import type { AdvanceDto, RecordAdvanceInput, StaffDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Button, Modal, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  readonly staffId: string;
  readonly date: string;
  readonly amount: string;
  readonly notes: string;
}

function emptyForm(defaultStaffId: string): FormState {
  return { staffId: defaultStaffId, date: todayIso(), amount: '', notes: '' };
}

export interface RecordAdvanceModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly staffList: readonly StaffDto[];
  /** Preselects the staff dropdown — the caller's currently-selected staff, if any. */
  readonly defaultStaffId: string | null;
  readonly onRecorded: (result: AdvanceDto) => void;
}

/** Same structural pattern as RecordPaymentModal.tsx — Money.fromRupees, reset-on-open, try/catch submit. */
export function RecordAdvanceModal({
  open,
  onClose,
  staffList,
  defaultStaffId,
  onRecorded,
}: RecordAdvanceModalProps): React.JSX.Element | null {
  const [form, setForm] = useState<FormState>(emptyForm(defaultStaffId ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm(defaultStaffId ?? staffList[0]?.id ?? ''));
      setError(null);
      setBusy(false);
    }
  }, [open, defaultStaffId, staffList]);

  if (!open) return null;

  async function handleSubmit(): Promise<void> {
    setError(null);

    if (form.staffId.length === 0) {
      setError('Select a staff member');
      return;
    }
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

    const trimmedNotes = form.notes.trim();
    const input: RecordAdvanceInput = {
      staffId: form.staffId,
      date: form.date,
      amountPaisa,
      notes: trimmedNotes.length === 0 ? undefined : trimmedNotes,
    };

    setBusy(true);
    try {
      const result = await ipc.staff.recordAdvance(input);
      setBusy(false);
      onRecorded(result);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Failed to record advance');
    }
  }

  return (
    <Modal open={open} title="Record peshgi" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        <Select
          label="Staff"
          value={form.staffId}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, staffId: e.target.value }));
          }}
        >
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.partyCode})
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, date: e.target.value }));
              }}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
            />
          </label>
          <TextInput
            label="Amount (Rs)"
            variant="number"
            required
            value={form.amount}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, amount: e.target.value }));
            }}
          />
        </div>

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
