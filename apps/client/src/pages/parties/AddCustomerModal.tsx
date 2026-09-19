import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { CreateCustomerInput, PriceLevelsDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Button, Modal, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const EMPTY_FORM = {
  name: '',
  shopName: '',
  phone: '',
  address: '',
  priceLevelId: '',
  creditLimit: '',
  notes: '',
};

/** '' on a text input means "not entered" — CreateCustomerInput wants null there, not ''. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface AddCustomerModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful create, with the (possibly auto-generated) party code. */
  readonly onCreated: (partyCode: string) => void;
}

/**
 * CL-9. Mirror of AddSupplierModal.tsx in structure and pattern.
 * Price level dropdown is backed by party:listPriceLevels (added this
 * phase — item:lookups has no priceLevels field, so this real read
 * replaces the spec's original "Retail/Wholesale" hardcoded assumption).
 * customerType is derived from the selected level's name (contains
 * "wholesale", case-insensitive) since price_level has no separate type column.
 */
export function AddCustomerModal({
  open,
  onClose,
  onCreated,
}: AddCustomerModalProps): React.JSX.Element | null {
  const [form, setForm] = useState(EMPTY_FORM);
  const [priceLevels, setPriceLevels] = useState<PriceLevelsDto>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setError(null);
      ipc.party
        .listPriceLevels()
        .then((levels) => {
          setPriceLevels(levels);
          setForm((prev) => ({ ...prev, priceLevelId: levels[0]?.id ?? '' }));
        })
        .catch(() => {
          setPriceLevels([]);
        });
    }
  }, [open]);

  if (!open) return null;

  function setField(
    field: keyof typeof EMPTY_FORM,
  ): (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void {
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

    if (form.phone.length > 0 && form.phone.length !== 11) {
      setError('Phone number must be exactly 11 digits (e.g. 03001234567)');
      return;
    }

    let creditLimitPaisa: number | null = null;
    if (form.creditLimit.trim().length > 0) {
      try {
        creditLimitPaisa = Money.fromRupees(form.creditLimit.trim());
      } catch {
        setError('Enter a valid credit limit');
        return;
      }
    }

    const selectedLevel = priceLevels.find((level) => level.id === form.priceLevelId);
    const customerType: CreateCustomerInput['customerType'] =
      selectedLevel && /wholesale/i.test(selectedLevel.name) ? 'wholesale' : 'retail';

    const input: CreateCustomerInput = {
      partyCode: null,
      name: form.name.trim(),
      shopName: blankToNull(form.shopName),
      phone: blankToNull(form.phone),
      address: blankToNull(form.address),
      customerType,
      priceLevelId: form.priceLevelId.length > 0 ? form.priceLevelId : null,
      creditLimitPaisa,
      notes: blankToNull(form.notes),
    };

    try {
      const result = await ipc.customer.create(input);
      onCreated(result.partyCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    }
  }

  return (
    <Modal open={open} title="Add customer" onClose={onClose} size="wide">
      <div className="flex flex-col gap-5">
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="Name"
            autoFocus
            required
            value={form.name}
            onChange={setField('name')}
          />
          <TextInput
            label="Shop name (optional)"
            value={form.shopName}
            onChange={setField('shopName')}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="Phone"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={11}
            placeholder="03XXXXXXXXX"
            value={form.phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
              setForm((prev) => ({ ...prev, phone: digits }));
            }}
          />
          <Select label="Price level" value={form.priceLevelId} onChange={setField('priceLevelId')}>
            {priceLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Area / address" value={form.address} onChange={setField('address')} />
        </div>

        <div className="border-t border-line" />
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Additional details
        </p>

        <div className="flex flex-col gap-1">
          <TextInput
            label="Credit limit (Rs)"
            variant="number"
            value={form.creditLimit}
            onChange={setField('creditLimit')}
          />
          <p className="text-xs text-ink-faint">0 or empty = no limit</p>
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-danger hover:underline"
          >
            Cancel
          </button>
          <Button
            variant="primary"
            size="large"
            onClick={() => {
              void handleSubmit();
            }}
          >
            <Check size={16} aria-hidden="true" />
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
