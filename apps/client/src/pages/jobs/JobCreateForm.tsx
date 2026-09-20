import { useState } from 'react';
import type { CreateJobInput, CustomerDto } from '@shop/contracts';
import { Alert, Button, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { CustomerPicker } from './CustomerPicker.js';

const APPLIANCE_TYPES = ['AC', 'Fridge', 'Oven', 'Other'] as const;

/**
 * V1 — the `brand` table (0001_init.sql) exists but has zero seeded rows
 * anywhere in the codebase (confirmed by grep across every migration and
 * bootstrap.ts before writing this) and no IPC channel exposes it yet —
 * a hardcoded fallback list per this task's own instructions, not a new
 * job:listBrands read against an empty table. "Other" always reveals a
 * free-text input so no real brand is ever blocked.
 */
const BRAND_OPTIONS = [
  'Dawlance',
  'Gree',
  'Haier',
  'PEL',
  'Orient',
  'Waves',
  'Samsung',
  'LG',
  'Kenwood',
  'Changhong Ruba',
  'Other',
] as const;

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
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [phone, setPhone] = useState('');
  const [applianceType, setApplianceType] = useState('');
  const [brandChoice, setBrandChoice] = useState('');
  const [brandOther, setBrandOther] = useState('');
  const brand = brandChoice === 'Other' ? brandOther : brandChoice;
  const [reportedFault, setReportedFault] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSelectCustomer(customer: CustomerDto): void {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setPhone(customer.phone ?? '');
  }

  function handleClearSelection(): void {
    setSelectedCustomer(null);
    setPhone('');
  }

  /**
   * OD-4's name+phone dedup, for the case where staff typed a fresh
   * name+phone rather than clicking a CustomerPicker dropdown row — if
   * they happen to match an existing customer exactly (case-insensitive
   * name, exact phone), reuse that party rather than creating a
   * duplicate. Re-searches by name (customer:search has no phone
   * parameter) and filters client-side for an exact phone match.
   */
  async function findExactDuplicate(
    name: string,
    phoneDigits: string,
  ): Promise<CustomerDto | null> {
    const matches = await ipc.customer.search({ query: name });
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
      setError('Customer name is required');
      return;
    }
    // Phone is required only while resolving/creating a customer by hand —
    // once an existing customer is selected, identity (customerId) already
    // disambiguates, so a customer with no phone on file doesn't block intake.
    if (!selectedCustomer) {
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
      let customerId: string;
      if (selectedCustomer) {
        customerId = selectedCustomer.id;
      } else {
        const duplicate = await findExactDuplicate(trimmedName, phone);
        if (duplicate) {
          customerId = duplicate.id;
        } else {
          const created = await ipc.customer.create({
            partyCode: null,
            name: trimmedName,
            shopName: null,
            phone,
            address: null,
            customerType: null,
            priceLevelId: null,
            creditLimitPaisa: null,
            notes: null,
          });
          customerId = created.id;
        }
      }

      const input: CreateJobInput = {
        customerId,
        customerNameAdhoc: null,
        customerPhone: null,
        jobType: 'in_shop',
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

      <CustomerPicker
        name={customerName}
        onNameChange={(value) => {
          setCustomerName(value);
          if (selectedCustomer) setSelectedCustomer(null);
        }}
        selected={selectedCustomer}
        onSelect={handleSelectCustomer}
        onClearSelection={handleClearSelection}
      />

      <TextInput
        label="Phone"
        required
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={11}
        placeholder="03XXXXXXXXX"
        disabled={selectedCustomer !== null}
        value={phone}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
          setPhone(digits);
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

      <Select
        label="Brand"
        required
        value={brandChoice}
        onChange={(e) => {
          setBrandChoice(e.target.value);
        }}
      >
        <option value="">—</option>
        {BRAND_OPTIONS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </Select>

      {brandChoice === 'Other' && (
        <TextInput
          label="Brand (other)"
          required
          autoFocus
          value={brandOther}
          onChange={(e) => {
            setBrandOther(e.target.value);
          }}
        />
      )}

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
