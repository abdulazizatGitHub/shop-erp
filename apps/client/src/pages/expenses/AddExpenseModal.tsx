import { useEffect, useState } from 'react';
import type { BusinessUnitOption } from '../../types/electron-api.js';
import type { CreateExpenseInput, ExpenseCategoryDto, ExpenseDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Button, Modal, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type ExpenseMethod = CreateExpenseInput['method'];

interface FormState {
  readonly date: string;
  readonly categoryId: string;
  readonly amount: string;
  readonly businessUnitId: string;
  readonly vehicle: string;
  readonly method: ExpenseMethod;
  readonly notes: string;
}

function emptyForm(defaultCategoryId: string): FormState {
  return {
    date: todayIso(),
    categoryId: defaultCategoryId,
    amount: '',
    businessUnitId: '',
    vehicle: '',
    method: 'cash',
    notes: '',
  };
}

export interface AddExpenseModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly categories: readonly ExpenseCategoryDto[];
  readonly businessUnits: readonly BusinessUnitOption[];
  readonly onCreated: (result: ExpenseDto) => void;
}

/**
 * Same structural pattern as RecordAdvanceModal.tsx / RecordPaymentModal.tsx.
 * Vehicle is always shown (not gated to Bike Fuel/Petrol categories) —
 * simpler than adding category-name matching logic for a field that's
 * harmless to leave blank on any other category.
 */
export function AddExpenseModal({
  open,
  onClose,
  categories,
  businessUnits,
  onCreated,
}: AddExpenseModalProps): React.JSX.Element | null {
  const [form, setForm] = useState<FormState>(emptyForm(categories[0]?.id ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm(categories[0]?.id ?? ''));
      setError(null);
      setBusy(false);
    }
  }, [open, categories]);

  if (!open) return null;

  async function handleSubmit(): Promise<void> {
    setError(null);

    if (form.categoryId.length === 0) {
      setError('Select a category');
      return;
    }
    // DC-3/Conflict 6 — must not allow submission without a business unit.
    if (form.businessUnitId.length === 0) {
      setError('Select which unit this cost belongs to');
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

    const trimmedVehicle = form.vehicle.trim();
    const trimmedNotes = form.notes.trim();
    const input: CreateExpenseInput = {
      categoryId: form.categoryId,
      expenseDate: form.date,
      amountPaisa,
      businessUnitId: form.businessUnitId,
      vehicle: trimmedVehicle.length === 0 ? undefined : trimmedVehicle,
      method: form.method,
      notes: trimmedNotes.length === 0 ? undefined : trimmedNotes,
    };

    setBusy(true);
    try {
      const result = await ipc.expense.create(input);
      setBusy(false);
      onCreated(result);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Failed to record expense');
    }
  }

  return (
    <Modal open={open} title="Add expense" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

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

          <Select
            label="Category"
            value={form.categoryId}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, categoryId: e.target.value }));
            }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <TextInput
            label="Amount (Rs)"
            variant="number"
            required
            value={form.amount}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, amount: e.target.value }));
            }}
          />

          <Select
            label="Which unit does this cost belong to?"
            value={form.businessUnitId}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, businessUnitId: e.target.value }));
            }}
          >
            <option value="" disabled>
              Select unit...
            </option>
            {businessUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>

          <TextInput
            label="Vehicle (optional)"
            value={form.vehicle}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, vehicle: e.target.value }));
            }}
          />

          <Select
            label="Method"
            value={form.method}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, method: e.target.value as ExpenseMethod }));
            }}
          >
            <option value="cash">From till</option>
            <option value="owner_personal">Owner&apos;s pocket</option>
          </Select>
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
