import { useEffect, useState } from 'react';
import type { StaffCreateInput } from '@shop/contracts';
import { Alert, Button, Modal, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

type StaffRoleOption = 'technician' | 'salesman' | 'helper';

const EMPTY_FORM = {
  name: '',
  phone: '',
  staffRole: 'technician' as StaffRoleOption,
  wageRateRupees: '',
  commissionPercent: '',
};

/**
 * PHASE_7.md §5 Correction C — the derived unit shown here is DISPLAY
 * ONLY. There is no business-unit input field; attendance.service.ts
 * resolves the real business_unit_id at attendance-save time, not here.
 */
const DERIVED_UNIT_TEXT: Record<StaffRoleOption, string> = {
  technician: 'Repair unit',
  salesman: 'Spare Parts unit',
  helper: 'Shared',
};

export interface AddStaffModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful create, with the (auto-generated) party code. */
  readonly onCreated: (partyCode: string) => void;
}

export function AddStaffModal({
  open,
  onClose,
  onCreated,
}: AddStaffModalProps): React.JSX.Element | null {
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
    field: 'name' | 'phone' | 'wageRateRupees' | 'commissionPercent',
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
    const wageRateRupees = Number(form.wageRateRupees);
    if (!Number.isFinite(wageRateRupees) || wageRateRupees < 0) {
      setError('Daily rate must be a non-negative number');
      return;
    }
    const commissionPercent =
      form.commissionPercent.trim().length === 0 ? 0 : Number(form.commissionPercent);
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0) {
      setError('Commission % must be a non-negative whole number');
      return;
    }

    // Rs -> paisa (x100), whole-number percent -> basis points (x100).
    // e.g. Rs 600/day -> 60000 paisa; 10% -> 1000 bp.
    const input: StaffCreateInput = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      staffRole: form.staffRole,
      wageRatePaisa: Math.round(wageRateRupees * 100),
      commissionBp: Math.round(commissionPercent * 100),
    };
    try {
      const result = await ipc.staff.create(input);
      onCreated(result.partyCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff member');
    }
  }

  return (
    <Modal open={open} title="Add staff member" onClose={onClose}>
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
          <TextInput label="Phone" required value={form.phone} onChange={setField('phone')} />
          <div className="flex flex-col gap-1">
            <Select
              label="Role"
              value={form.staffRole}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  staffRole: e.target.value as StaffRoleOption,
                }));
              }}
            >
              <option value="technician">Technician</option>
              <option value="salesman">Salesman</option>
              <option value="helper">Helper</option>
            </Select>
            <span className="text-sm text-ink-muted">
              &rarr; {DERIVED_UNIT_TEXT[form.staffRole]}
            </span>
          </div>
          <TextInput
            label="Daily rate (Rs)"
            variant="number"
            min="0"
            required
            value={form.wageRateRupees}
            onChange={setField('wageRateRupees')}
          />
          <TextInput
            label="Commission % (0 if none)"
            variant="number"
            min="0"
            value={form.commissionPercent}
            onChange={setField('commissionPercent')}
          />
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
