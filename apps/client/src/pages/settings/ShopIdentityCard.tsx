import { useEffect, useState } from 'react';
import type { ShopIdentityDto } from '@shop/contracts';
import { Alert, Button, Card, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

interface FormState {
  readonly shopName: string;
  readonly shopPhone: string;
  readonly shopAddress: string;
  readonly shopEmail: string;
  readonly invoiceHeaderText: string;
  readonly invoiceFooterText: string;
  readonly statementFooterText: string;
}

function toForm(identity: ShopIdentityDto): FormState {
  return {
    shopName: identity.shopName,
    shopPhone: identity.shopPhone ?? '',
    shopAddress: identity.shopAddress ?? '',
    shopEmail: identity.shopEmail ?? '',
    invoiceHeaderText: identity.invoiceHeaderText ?? '',
    invoiceFooterText: identity.invoiceFooterText ?? '',
    statementFooterText: identity.statementFooterText ?? '',
  };
}

/** '' on a text input means "not entered" — same blankToNull pattern as AddSupplierModal.tsx. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** CL-0a. Extracted out of SettingsPage.tsx to keep it under the 300-line file cap. */
export function ShopIdentityCard(): React.JSX.Element {
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc.setting
      .getShopIdentity()
      .then((identity) => {
        const loaded = toForm(identity);
        setSaved(loaded);
        setForm(loaded);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });
  }, []);

  function update(field: keyof FormState, value: string): void {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function save(): void {
    if (!form) return;
    const trimmedName = form.shopName.trim();
    if (trimmedName.length === 0) {
      setError('Shop name cannot be blank');
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    ipc.setting
      .setShopIdentity({
        shopName: trimmedName,
        shopPhone: blankToNull(form.shopPhone),
        shopAddress: blankToNull(form.shopAddress),
        shopEmail: blankToNull(form.shopEmail),
        invoiceHeaderText: blankToNull(form.invoiceHeaderText),
        invoiceFooterText: blankToNull(form.invoiceFooterText),
        statementFooterText: blankToNull(form.statementFooterText),
      })
      .then(() => {
        const next = { ...form, shopName: trimmedName };
        setSaved(next);
        setForm(next);
        setMessage('Shop identity saved.');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save setting');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const loading = form === null;
  const dirty = form !== null && saved !== null && JSON.stringify(form) !== JSON.stringify(saved);

  return (
    <Card title="Shop identity">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="Shop name (printed on every document)"
          value={form?.shopName ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('shopName', e.target.value);
          }}
        />
        <TextInput
          label="Phone"
          value={form?.shopPhone ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('shopPhone', e.target.value);
          }}
        />
        <TextInput
          label="Address"
          value={form?.shopAddress ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('shopAddress', e.target.value);
          }}
        />
        <TextInput
          label="Email"
          value={form?.shopEmail ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('shopEmail', e.target.value);
          }}
        />
        <TextInput
          label="Invoice header text"
          value={form?.invoiceHeaderText ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('invoiceHeaderText', e.target.value);
          }}
        />
        <TextInput
          label="Invoice footer text"
          value={form?.invoiceFooterText ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('invoiceFooterText', e.target.value);
          }}
        />
        <TextInput
          label="Statement footer text"
          value={form?.statementFooterText ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('statementFooterText', e.target.value);
          }}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" disabled={loading || saving || !dirty} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  );
}
