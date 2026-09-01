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
  ): (e: React.ChangeEvent<HTMLInputElement>) => void {
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
    <Modal open={open} title="Add supplier" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="Name"
            autoFocus
            required
            value={form.name}
            onChange={setField('name')}
          />
          <TextInput label="Shop Name" value={form.shopName} onChange={setField('shopName')} />
          <TextInput label="Phone" required value={form.phone} onChange={setField('phone')} />
          <TextInput label="City / Area" value={form.cityArea} onChange={setField('cityArea')} />
          <div className="col-span-2">
            <TextInput
              label="Payment Terms"
              value={form.paymentTerms}
              onChange={setField('paymentTerms')}
            />
          </div>
          <div className="col-span-2">
            <TextInput label="Notes" value={form.notes} onChange={setField('notes')} />
          </div>
        </div>
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
