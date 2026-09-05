import { useState } from 'react';
import type { CreateJobInput } from '@shop/contracts';
import { Alert, Button, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const APPLIANCE_TYPES = ['AC', 'Fridge', 'Oven', 'Other'] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface JobCreateFormProps {
  readonly onCreated: () => void;
  readonly onCancel: () => void;
}

/**
 * Quick intake — exactly 4 fields, so a counter can create a job in
 * seconds while a customer waits. Everything else (registered-customer
 * link, brand, model, serial, technician, estimate, promised date) is
 * filled in afterward from the job card (JobDetailsView), once the job
 * already exists and there's no one waiting on the create step itself.
 */
export function JobCreateForm({ onCreated, onCancel }: JobCreateFormProps): React.JSX.Element {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [applianceType, setApplianceType] = useState('');
  const [reportedFault, setReportedFault] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(): Promise<void> {
    setError(null);
    if (reportedFault.trim().length === 0) {
      setError('Reported fault is required');
      return;
    }
    const input: CreateJobInput = {
      customerId: null,
      customerNameAdhoc: customerName.trim().length > 0 ? customerName.trim() : null,
      customerPhone: customerPhone.trim().length > 0 ? customerPhone.trim() : null,
      // Not asked at quick intake — 'in_shop' is the common case; staff
      // can be given a way to change it from the job card later if this
      // turns out to matter in practice.
      jobType: 'in_shop',
      applianceType: applianceType.length > 0 ? applianceType : null,
      applianceBrand: null,
      applianceModel: null,
      applianceSerial: null,
      reportedFault: reportedFault.trim(),
      receivedDate: todayIso(),
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: null,
      notes: null,
    };
    setSubmitting(true);
    try {
      await ipc.job.create(input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}

      <TextInput
        label="Customer name"
        autoFocus
        value={customerName}
        onChange={(e) => {
          setCustomerName(e.target.value);
        }}
      />
      <TextInput
        label="Phone (optional)"
        value={customerPhone}
        onChange={(e) => {
          setCustomerPhone(e.target.value);
        }}
      />
      <Select
        label="Appliance type"
        value={applianceType}
        onChange={(e) => {
          setApplianceType(e.target.value);
        }}
      >
        <option value="">—</option>
        {APPLIANCE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <TextInput
        label="Reported fault"
        value={reportedFault}
        onChange={(e) => {
          setReportedFault(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void handleCreate();
          }
        }}
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {/* DEBT-1 (PROJECT.md): raw Tailwind, not the shared Button component
       * — same owner-approved exception used elsewhere in Jobs; Button has
       * no size/colour combination matching this brief's w-full px-6 py-2.5. */}
      <button
        type="button"
        disabled={submitting}
        onClick={() => {
          void handleCreate();
        }}
        className="mt-2 w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Create Job
      </button>
    </div>
  );
}
