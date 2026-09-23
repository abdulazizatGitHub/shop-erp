import { useEffect, useState } from 'react';
import type { ShopIdentityDto } from '@shop/contracts';
import { Alert, Button, TextInput } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { blankToNull } from '../formHelpers.js';
import { useSettingsDirty } from '../SettingsDirtyContext.js';
import { useSectionActions } from '../SettingsSectionFrame.js';

interface FormState {
  readonly shopName: string;
  readonly shopPhone: string;
  readonly shopAddress: string;
  readonly shopEmail: string;
}

function toForm(identity: ShopIdentityDto): FormState {
  return {
    shopName: identity.shopName,
    shopPhone: identity.shopPhone ?? '',
    shopAddress: identity.shopAddress ?? '',
    shopEmail: identity.shopEmail ?? '',
  };
}

/**
 * P16-1b — split out of ShopIdentityCard.tsx (now just these 4 fields;
 * invoice/statement text moved to InvoiceReceiptsSettingsSection.tsx).
 * Same underlying setShopIdentity call and 7-field DTO as before — no
 * storage change. At Save time, fetches the identity fresh (not the
 * mount-time copy) and overlays only this section's 4 fields onto it, so
 * a concurrent edit to the other section's fields is never clobbered by a
 * stale snapshot.
 */
export function ShopSettingsSection(): React.JSX.Element {
  const { setDirty } = useSettingsDirty();
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

  const loading = form === null;
  const dirty = form !== null && saved !== null && JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  function update(field: keyof FormState, value: string): void {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function save(): Promise<void> {
    if (!form) return;
    const trimmedName = form.shopName.trim();
    if (trimmedName.length === 0) {
      setError('Shop name cannot be blank');
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const current = await ipc.setting.getShopIdentity();
      await ipc.setting.setShopIdentity({
        shopName: trimmedName,
        shopPhone: blankToNull(form.shopPhone),
        shopAddress: blankToNull(form.shopAddress),
        shopEmail: blankToNull(form.shopEmail),
        invoiceHeaderText: current.invoiceHeaderText,
        invoiceFooterText: current.invoiceFooterText,
        statementFooterText: current.statementFooterText,
      });
      const next = { ...form, shopName: trimmedName };
      setSaved(next);
      setForm(next);
      setMessage('Shop settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save setting');
    } finally {
      setSaving(false);
    }
  }

  useSectionActions(
    <Button
      variant="primary"
      disabled={loading || saving || !dirty}
      onClick={() => {
        void save();
      }}
    >
      {saving ? 'Saving…' : 'Save'}
    </Button>,
  );

  return (
    <div className="flex flex-col gap-4">
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
      </div>
    </div>
  );
}
