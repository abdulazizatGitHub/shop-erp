import { useEffect, useState } from 'react';
import type { CreateSupplierInput } from '@shop/contracts';
import { Alert, Button, Modal, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const EMPTY_FORM = {
  name: '',
  shopName: '',
  phone: '',
  cityArea: '',
  paymentTerms: '',
  notes: '',
};

/** '' on a text input means "not entered" — CreateSupplierInput wants null there, not ''. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface AddSupplierModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful create, with the (possibly auto-generated) party code. */
  readonly onCreated: (partyCode: string) => void;
}

export function AddSupplierModal({
  open,
  onClose,
  onCreated,
}: AddSupplierModalProps): React.JSX.Element | null {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  function setField(
    field: keyof typeof EMPTY_FORM,
  ): (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void {
    return (e) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (form.name.trim().length === 0) {
      setError('Name is required');
      return;
    }
    if (form.phone.trim().length === 0) {
      setError('Phone is required');
      return;
    }
    const input: CreateSupplierInput = {
      partyCode: null,
      name: form.name.trim(),
      shopName: blankToNull(form.shopName),
      phone: form.phone.trim(),
      cityArea: blankToNull(form.cityArea),
      paymentTerms: blankToNull(form.paymentTerms),
      notes: blankToNull(form.notes),
    };
    try {
      const result = await ipc.party.create(input);
      onCreated(result.partyCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier');
    }
  }

  return (
    <Modal open={open} title="Add supplier" onClose={onClose} size="wide">
      <div className="flex flex-col gap-5">
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="Supplier name"
            autoFocus
            required
            value={form.name}
            onChange={setField('name')}
          />
          <TextInput
            label="Shop / business name"
            value={form.shopName}
            onChange={setField('shopName')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Phone" required value={form.phone} onChange={setField('phone')} />
          <TextInput label="City / Area" value={form.cityArea} onChange={setField('cityArea')} />
        </div>

        <div className="border-t border-line" />
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Additional details
        </p>

        <div className="flex flex-col gap-1">
          <TextInput
            label="Payment Terms"
            value={form.paymentTerms}
            onChange={setField('paymentTerms')}
          />
          <p className="text-xs text-ink-faint">e.g. Net 30, Cash on delivery</p>
        </div>

        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Notes
          <textarea
            value={form.notes}
            onChange={setField('notes')}
            rows={3}
            className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              void handleSubmit();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
