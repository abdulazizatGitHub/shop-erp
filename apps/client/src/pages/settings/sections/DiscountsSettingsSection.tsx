import { useEffect, useState } from 'react';
import { Alert, Button } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { useSettingsDirty } from '../SettingsDirtyContext.js';
import { useSectionActions } from '../SettingsSectionFrame.js';

/** Splits a comma-separated preset draft into trimmed, non-empty, positive-numeric strings. Invalid tokens are dropped, not rejected — matches the light validation style of the wholesale-discount card this replaces. */
function parsePresetCsv(csv: string): readonly string[] {
  return csv
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && /^\d+(\.\d+)?$/.test(token) && Number(token) > 0);
}

interface FormState {
  readonly applyWalkin: boolean;
  readonly applyWholesale: boolean;
  readonly pkrEnabled: boolean;
  readonly pctEnabled: boolean;
  readonly pkrPresetsDraft: string;
  readonly pctPresetsDraft: string;
}

/**
 * P16-1b — relocated from DiscountPresetsCard.tsx (Card wrapper stripped,
 * same 6 IPC calls, same validation). Dirty-tracking (a `saved` snapshot
 * compared against the live draft) is a genuine addition, not present in
 * the original card — needed so the sub-nav's unsaved-changes guard works
 * correctly here too, not just on Shop/Invoices & Receipts.
 */
export function DiscountsSettingsSection(): React.JSX.Element {
  const { setDirty } = useSettingsDirty();
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      ipc.setting.getDiscountApplyWalkin(),
      ipc.setting.getDiscountApplyWholesale(),
      ipc.setting.getDiscountPkrEnabled(),
      ipc.setting.getDiscountPctEnabled(),
      ipc.setting.getDiscountPkrPresets(),
      ipc.setting.getDiscountPctPresets(),
    ])
      .then(([applyWalkin, applyWholesale, pkrEnabled, pctEnabled, pkrPresets, pctPresets]) => {
        const loaded: FormState = {
          applyWalkin,
          applyWholesale,
          pkrEnabled,
          pctEnabled,
          pkrPresetsDraft: pkrPresets.join(','),
          pctPresetsDraft: pctPresets.join(','),
        };
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

  function update<K extends keyof FormState>(field: K, value: FormState[K]): void {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function save(): void {
    if (!form) return;
    const pkrPresets = parsePresetCsv(form.pkrPresetsDraft);
    const pctPresets = parsePresetCsv(form.pctPresetsDraft);
    if (form.pkrEnabled && pkrPresets.length === 0) {
      setError('Enter at least one PKR preset amount, or disable PKR discounts.');
      return;
    }
    if (form.pctEnabled && pctPresets.length === 0) {
      setError('Enter at least one percentage preset, or disable percentage discounts.');
      return;
    }
    if (pctPresets.some((p) => Number(p) > 100)) {
      setError('Percentage presets must be 100 or less.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    Promise.all([
      ipc.setting.setDiscountApplyWalkin({ value: form.applyWalkin }),
      ipc.setting.setDiscountApplyWholesale({ value: form.applyWholesale }),
      ipc.setting.setDiscountPkrEnabled({ value: form.pkrEnabled }),
      ipc.setting.setDiscountPctEnabled({ value: form.pctEnabled }),
      ipc.setting.setDiscountPkrPresets({ value: pkrPresets }),
      ipc.setting.setDiscountPctPresets({ value: pctPresets }),
    ])
      .then(() => {
        setSaved(form);
        setMessage('Discount presets saved.');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save setting');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  useSectionActions(
    <Button variant="primary" disabled={loading || saving || !dirty} onClick={save}>
      {saving ? 'Saving…' : 'Save'}
    </Button>,
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">Apply discount to</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form?.applyWalkin ?? false}
              disabled={loading || saving}
              onChange={(e) => {
                update('applyWalkin', e.target.checked);
              }}
            />
            Walk-in customers
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form?.applyWholesale ?? false}
              disabled={loading || saving}
              onChange={(e) => {
                update('applyWholesale', e.target.checked);
              }}
            />
            Wholesale customers
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={form?.pkrEnabled ?? false}
            disabled={loading || saving}
            onChange={(e) => {
              update('pkrEnabled', e.target.checked);
            }}
          />
          Enable PKR discount option
        </label>
        <input
          type="text"
          placeholder="e.g. 100,200,500,1000"
          value={form?.pkrPresetsDraft ?? ''}
          disabled={loading || saving || !form.pkrEnabled}
          onChange={(e) => {
            update('pkrPresetsDraft', e.target.value);
          }}
          className="w-full rounded-md border border-line bg-surface-input px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      <div>
        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={form?.pctEnabled ?? false}
            disabled={loading || saving}
            onChange={(e) => {
              update('pctEnabled', e.target.checked);
            }}
          />
          Enable % discount option
        </label>
        <input
          type="text"
          placeholder="e.g. 3,5,10"
          value={form?.pctPresetsDraft ?? ''}
          disabled={loading || saving || !form.pctEnabled}
          onChange={(e) => {
            update('pctPresetsDraft', e.target.value);
          }}
          className="w-full rounded-md border border-line bg-surface-input px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
    </div>
  );
}
