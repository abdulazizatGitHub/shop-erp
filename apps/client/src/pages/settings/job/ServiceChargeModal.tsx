import { useEffect, useState } from 'react';
import type {
  CommissionMode,
  CreateServiceChargeInput,
  ServiceChargeAdminDto,
  UpdateServiceChargeInput,
} from '@shop/contracts';
import { Alert, Button, Modal, Select, TextInput } from '@shop/ui';
import { Money } from '@shop/shared';
import { ipc } from '../../../lib/ipc.js';

interface FormState {
  readonly name: string;
  readonly jobType: string;
  readonly retailRupees: string;
  readonly wholesaleRupees: string;
  readonly typicalMinutes: string;
  readonly notes: string;
  readonly commissionMode: CommissionMode;
  readonly commissionAmountRupees: string;
  readonly commissionPercent: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  jobType: '',
  retailRupees: '',
  wholesaleRupees: '',
  typicalMinutes: '',
  notes: '',
  commissionMode: 'none',
  commissionAmountRupees: '',
  commissionPercent: '',
};

function toForm(charge: ServiceChargeAdminDto): FormState {
  return {
    name: charge.name,
    jobType: charge.jobType ?? '',
    retailRupees: String(Money.toRupees(Money.of(charge.retailChargePaisa))),
    wholesaleRupees:
      charge.wholesaleChargePaisa === null
        ? ''
        : String(Money.toRupees(Money.of(charge.wholesaleChargePaisa))),
    typicalMinutes: charge.typicalMinutes === null ? '' : String(charge.typicalMinutes),
    notes: charge.notes ?? '',
    commissionMode: charge.commissionMode,
    commissionAmountRupees:
      charge.commissionAmountPaisa === null
        ? ''
        : String(Money.toRupees(Money.of(charge.commissionAmountPaisa))),
    commissionPercent:
      charge.commissionBp === null ? '' : String(Money.toPercent(charge.commissionBp)),
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface ServiceChargeModalProps {
  readonly open: boolean;
  /** null = create; a charge = edit that charge. */
  readonly editing: ServiceChargeAdminDto | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/** P16-1 — create/edit form for a service charge. Shared by both flows (the DB write path differs; the form does not). */
export function ServiceChargeModal({
  open,
  editing,
  onClose,
  onSaved,
}: ServiceChargeModalProps): React.JSX.Element | null {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? toForm(editing) : EMPTY_FORM);
      setError(null);
    }
  }, [open, editing]);

  if (!open) return null;

  function setField(field: keyof FormState): (e: React.ChangeEvent<HTMLInputElement>) => void {
    return (e) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(): Promise<void> {
    setError(null);

    const name = form.name.trim();
    if (name.length === 0) {
      setError('Name is required');
      return;
    }

    let retailChargePaisa: number;
    try {
      retailChargePaisa = Money.fromRupees(form.retailRupees);
    } catch {
      setError('Retail charge must be a valid amount');
      return;
    }
    if (retailChargePaisa <= 0) {
      setError('Retail charge must be greater than zero');
      return;
    }

    let wholesaleChargePaisa: number | null = null;
    if (form.wholesaleRupees.trim().length > 0) {
      try {
        wholesaleChargePaisa = Money.fromRupees(form.wholesaleRupees);
      } catch {
        setError('Wholesale charge must be a valid amount, or left blank');
        return;
      }
      if (wholesaleChargePaisa <= 0) {
        setError('Wholesale charge must be greater than zero, or left blank');
        return;
      }
    }

    let typicalMinutes: number | null = null;
    if (form.typicalMinutes.trim().length > 0) {
      const minutes = Number(form.typicalMinutes);
      if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0) {
        setError('Typical minutes must be a positive whole number, or left blank');
        return;
      }
      typicalMinutes = minutes;
    }

    let commissionAmountPaisa: number | null = null;
    let commissionBp: number | null = null;
    if (form.commissionMode === 'fixed') {
      try {
        commissionAmountPaisa = Money.fromRupees(form.commissionAmountRupees);
      } catch {
        setError('Fixed commission amount must be a valid amount');
        return;
      }
      if (commissionAmountPaisa <= 0) {
        setError('Fixed commission amount must be greater than zero');
        return;
      }
    } else if (form.commissionMode === 'bp') {
      try {
        commissionBp = Money.fromPercent(form.commissionPercent);
      } catch {
        setError(
          'Commission percent must be a valid percentage in whole basis points (e.g. 12.34%, not 12.345%)',
        );
        return;
      }
      if (commissionBp <= 0 || commissionBp > 10000) {
        setError('Commission percent must be between 0 and 100');
        return;
      }
    }

    const shared = {
      name,
      jobType: blankToNull(form.jobType),
      retailChargePaisa,
      wholesaleChargePaisa,
      typicalMinutes,
      notes: blankToNull(form.notes),
      commissionMode: form.commissionMode,
      commissionAmountPaisa,
      commissionBp,
    };

    setSaving(true);
    try {
      if (editing) {
        const input: UpdateServiceChargeInput = { id: editing.id, ...shared };
        await ipc.job.updateServiceCharge(input);
      } else {
        const input: CreateServiceChargeInput = shared;
        await ipc.job.createServiceCharge(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service charge');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Edit service charge' : 'Add service charge'}
      onClose={onClose}
    >
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
          <TextInput
            label="Job type (optional)"
            value={form.jobType}
            onChange={setField('jobType')}
          />
          <TextInput
            label="Retail charge (Rs)"
            variant="number"
            min="0"
            required
            value={form.retailRupees}
            onChange={setField('retailRupees')}
          />
          <TextInput
            label="Wholesale charge (Rs, optional)"
            variant="number"
            min="0"
            value={form.wholesaleRupees}
            onChange={setField('wholesaleRupees')}
          />
          <TextInput
            label="Typical minutes (optional)"
            variant="number"
            min="0"
            value={form.typicalMinutes}
            onChange={setField('typicalMinutes')}
          />
          <Select
            label="Commission"
            value={form.commissionMode}
            onChange={(e) => {
              const commissionMode = e.target.value as CommissionMode;
              setForm((prev) => ({ ...prev, commissionMode }));
            }}
          >
            <option value="none">None</option>
            <option value="fixed">Fixed amount</option>
            <option value="bp">Percent of charge</option>
          </Select>
          {form.commissionMode === 'fixed' && (
            <TextInput
              label="Commission amount (Rs)"
              variant="number"
              min="0"
              required
              value={form.commissionAmountRupees}
              onChange={setField('commissionAmountRupees')}
            />
          )}
          {form.commissionMode === 'bp' && (
            <TextInput
              label="Commission (% of charge)"
              variant="number"
              min="0"
              max="100"
              required
              value={form.commissionPercent}
              onChange={setField('commissionPercent')}
            />
          )}
          <TextInput label="Notes (optional)" value={form.notes} onChange={setField('notes')} />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
