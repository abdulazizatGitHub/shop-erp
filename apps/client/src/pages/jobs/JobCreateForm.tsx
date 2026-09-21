import { useState } from 'react';
import type { CreateJobInput, JobClientDto } from '@shop/contracts';
import { Alert, Button, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { JobAddressFields } from './JobAddressFields.js';
import { JobApplianceFields } from './JobApplianceFields.js';
import { JobClientPicker } from './JobClientPicker.js';
import { JobTypeToggle, type JobTypeChoice } from './JobTypeToggle.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface JobCreateFormProps {
  readonly onCreated: () => void;
  readonly onCancel: () => void;
}

/**
 * P14-2 — 5-field quick intake: Customer (search-or-create), Phone,
 * Appliance type, Brand, Reported fault. Replaces the old 4-field
 * adhoc-only form: every job now carries a real party.id (customerId),
 * either an existing one or one created here, never bare
 * customerNameAdhoc/customerPhone text — needed so the job card's
 * customer name can link to CustomerDetailPage (OD-6) and so the shop
 * never accumulates duplicate customer records at intake (OD-4).
 * Promised date is intentionally NOT asked here — OD-5, set later on the
 * job card. Brand/model/serial beyond "Brand" likewise stay on the job
 * card, filled in after the fact.
 */
export function JobCreateForm({ onCreated, onCancel }: JobCreateFormProps): React.JSX.Element {
  const [customerName, setCustomerName] = useState('');
  const [selectedClient, setSelectedClient] = useState<JobClientDto | null>(null);
  const [phone, setPhone] = useState('');
  const [jobType, setJobType] = useState<JobTypeChoice>('in_shop');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [applianceType, setApplianceType] = useState('');
  const [brandChoice, setBrandChoice] = useState('');
  const [brandOther, setBrandOther] = useState('');
  const brand = brandChoice === 'Other' ? brandOther : brandChoice;
  const [reportedFault, setReportedFault] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * OD-4 — auto-fills the address group from the selected client's own
   * job_client record. Populated unconditionally here (not gated on
   * jobType === 'on_site') since the fields are simply hidden while
   * job type is 'in_shop' — the same result as a jobType-gated effect,
   * without a second effect watching [jobType, selectedClient]. Still
   * editable after auto-fill (OD-4) since these are plain controlled
   * TextInputs, not locked like the Phone field.
   */
  function handleSelectClient(client: JobClientDto): void {
    setSelectedClient(client);
    setCustomerName(client.name);
    setPhone(client.phone ?? '');
    setAddress(client.address ?? '');
    setArea(client.area ?? '');
    setLandmark(client.landmark ?? '');
  }

  function handleClearSelection(): void {
    setSelectedClient(null);
    setPhone('');
    setAddress('');
    setArea('');
    setLandmark('');
  }

  /**
   * OD-5's name+phone dedup, for the case where staff typed a fresh
   * name+phone rather than clicking a JobClientPicker dropdown row — if
   * they happen to match an existing job_client exactly (case-insensitive
   * name, exact phone), reuse that record rather than creating a
   * duplicate. Re-searches by name (jobClient:search also matches phone,
   * but a bare name search is enough here) and filters client-side for
   * an exact phone match — same split CustomerPicker/JobCreateForm used.
   */
  async function findExactDuplicate(
    name: string,
    phoneDigits: string,
  ): Promise<JobClientDto | null> {
    const matches = await ipc.jobClient.search({ query: name });
    return (
      matches.find(
        (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase() && c.phone === phoneDigits,
      ) ?? null
    );
  }

  async function handleCreate(): Promise<void> {
    setError(null);

    const trimmedName = customerName.trim();
    if (trimmedName.length === 0) {
      setError('Client name is required');
      return;
    }
    // Phone is required only while resolving/creating a client by hand —
    // once an existing client is selected, identity (jobClientId) already
    // disambiguates, so a client with no phone on file doesn't block intake.
    if (!selectedClient) {
      if (phone.length === 0) {
        setError('Phone is required');
        return;
      }
      if (phone.length !== 11) {
        setError('Phone number must be exactly 11 digits (e.g. 03001234567)');
        return;
      }
    }
    if (brand.trim().length === 0) {
      setError('Brand is required');
      return;
    }
    if (reportedFault.trim().length === 0) {
      setError('Reported fault is required');
      return;
    }

    setSubmitting(true);
    try {
      let jobClientId: string | null = null;
      let newClient: CreateJobInput['newClient'] = null;
      if (selectedClient) {
        jobClientId = selectedClient.id;
      } else {
        const duplicate = await findExactDuplicate(trimmedName, phone);
        if (duplicate) {
          jobClientId = duplicate.id;
        } else {
          const onSite = jobType === 'on_site';
          newClient = {
            name: trimmedName,
            phone,
            phone2: null,
            address: onSite && address.trim().length > 0 ? address.trim() : null,
            area: onSite && area.trim().length > 0 ? area.trim() : null,
            landmark: onSite && landmark.trim().length > 0 ? landmark.trim() : null,
            notes: null,
          };
        }
      }

      const input: CreateJobInput = {
        // BUG-JOBCLIENT-1 — job intake no longer creates/links a party
        // (Spare Parts ledger customer); job_client is a separate
        // population (Q-P15-1). customerId stays in the contract
        // (never removed — job.customer_id is never dropped, OD-3) but
        // this form always sends null going forward.
        customerId: null,
        customerNameAdhoc: null,
        customerPhone: null,
        jobClientId,
        newClient,
        jobType,
        applianceType: applianceType.length > 0 ? applianceType : null,
        applianceBrand: brand.trim().length > 0 ? brand.trim() : null,
        applianceModel: null,
        applianceSerial: null,
        reportedFault: reportedFault.trim(),
        receivedDate: todayIso(),
        promisedDate: null,
        estimateAmountPaisa: null,
        assignedTo: null,
        notes: null,
      };
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

      <JobClientPicker
        name={customerName}
        onNameChange={(value) => {
          setCustomerName(value);
          if (selectedClient) setSelectedClient(null);
        }}
        selected={selectedClient}
        onSelect={handleSelectClient}
        onClearSelection={handleClearSelection}
      />

      <TextInput
        label="Phone"
        required
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={11}
        placeholder="03XXXXXXXXX"
        disabled={selectedClient !== null}
        value={phone}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
          setPhone(digits);
        }}
      />

      <JobTypeToggle value={jobType} onChange={setJobType} />

      {jobType === 'on_site' && (
        <JobAddressFields
          address={address}
          onAddressChange={setAddress}
          area={area}
          onAreaChange={setArea}
          landmark={landmark}
          onLandmarkChange={setLandmark}
        />
      )}

      <JobApplianceFields
        applianceType={applianceType}
        onApplianceTypeChange={setApplianceType}
        brandChoice={brandChoice}
        onBrandChoiceChange={setBrandChoice}
        brandOther={brandOther}
        onBrandOtherChange={setBrandOther}
      />

      <TextInput
        label="Reported fault"
        required
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
      <div className="mt-2">
        {/* G6 — was a raw <button className="bg-blue-600 ...">, the DEBT-1
         * exception noted above; now the shared Button's primary variant,
         * matching every other primary action in the app. */}
        <Button
          variant="primary"
          fullWidth
          disabled={submitting}
          onClick={() => {
            void handleCreate();
          }}
        >
          Create Job
        </Button>
      </div>
    </div>
  );
}
