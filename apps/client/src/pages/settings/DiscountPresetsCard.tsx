import { useEffect, useState } from 'react';
import { Alert, Button, Card } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

/** Splits a comma-separated preset draft into trimmed, non-empty, positive-numeric strings. Invalid tokens are dropped, not rejected — matches the light validation style of the wholesale-discount card this replaces. */
function parsePresetCsv(csv: string): readonly string[] {
  return csv
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && /^\d+(\.\d+)?$/.test(token) && Number(token) > 0);
}

/**
 * D-1 — owner-configured discount presets: two independently enable-able
 * preset lists (PKR amounts, percentages) plus which customer types they
 * apply to. Replaces the free-form PKR/% discount inputs on the sale
 * screen (see useDiscount.ts/CheckoutPanel.tsx) — the salesman now picks
 * from a dropdown built from these presets rather than typing a number.
 */
export function DiscountPresetsCard(): React.JSX.Element {
  const [applyWalkin, setApplyWalkinValue] = useState<boolean | null>(null);
  const [applyWholesale, setApplyWholesaleValue] = useState<boolean | null>(null);
  const [pkrEnabled, setPkrEnabledValue] = useState<boolean | null>(null);
  const [pctEnabled, setPctEnabledValue] = useState<boolean | null>(null);
  const [pkrPresetsDraft, setPkrPresetsDraft] = useState('');
  const [pctPresetsDraft, setPctPresetsDraft] = useState('');
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
      .then(([walkin, wholesale, pkrOn, pctOn, pkrPresets, pctPresets]) => {
        setApplyWalkinValue(walkin);
        setApplyWholesaleValue(wholesale);
        setPkrEnabledValue(pkrOn);
        setPctEnabledValue(pctOn);
        setPkrPresetsDraft(pkrPresets.join(','));
        setPctPresetsDraft(pctPresets.join(','));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });
  }, []);

  const loaded =
    applyWalkin !== null && applyWholesale !== null && pkrEnabled !== null && pctEnabled !== null;

  function save(): void {
    if (
      applyWalkin === null ||
      applyWholesale === null ||
      pkrEnabled === null ||
      pctEnabled === null
    ) {
      return;
    }
    const pkrPresets = parsePresetCsv(pkrPresetsDraft);
    const pctPresets = parsePresetCsv(pctPresetsDraft);
    if (pkrEnabled && pkrPresets.length === 0) {
      setError('Enter at least one PKR preset amount, or disable PKR discounts.');
      return;
    }
    if (pctEnabled && pctPresets.length === 0) {
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
      ipc.setting.setDiscountApplyWalkin({ value: applyWalkin }),
      ipc.setting.setDiscountApplyWholesale({ value: applyWholesale }),
      ipc.setting.setDiscountPkrEnabled({ value: pkrEnabled }),
      ipc.setting.setDiscountPctEnabled({ value: pctEnabled }),
      ipc.setting.setDiscountPkrPresets({ value: pkrPresets }),
      ipc.setting.setDiscountPctPresets({ value: pctPresets }),
    ])
      .then(() => {
        setMessage('Discount presets saved.');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save setting');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <Card title="Discount presets">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <p className="mb-2 text-sm font-medium text-ink-muted">Apply discount to</p>
      <div className="mb-4 flex gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={applyWalkin ?? false}
            disabled={!loaded || saving}
            onChange={(e) => {
              setApplyWalkinValue(e.target.checked);
            }}
          />
          Walk-in customers
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={applyWholesale ?? false}
            disabled={!loaded || saving}
            onChange={(e) => {
              setApplyWholesaleValue(e.target.checked);
            }}
          />
          Wholesale customers
        </label>
      </div>

      <div className="mb-4">
        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={pkrEnabled ?? false}
            disabled={!loaded || saving}
            onChange={(e) => {
              setPkrEnabledValue(e.target.checked);
            }}
          />
          Enable PKR discount option
        </label>
        <input
          type="text"
          placeholder="e.g. 100,200,500,1000"
          value={pkrPresetsDraft}
          disabled={!loaded || saving || !pkrEnabled}
          onChange={(e) => {
            setPkrPresetsDraft(e.target.value);
          }}
          className="w-full rounded-md border border-line bg-surface-input px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={pctEnabled ?? false}
            disabled={!loaded || saving}
            onChange={(e) => {
              setPctEnabledValue(e.target.checked);
            }}
          />
          Enable % discount option
        </label>
        <input
          type="text"
          placeholder="e.g. 3,5,10"
          value={pctPresetsDraft}
          disabled={!loaded || saving || !pctEnabled}
          onChange={(e) => {
            setPctPresetsDraft(e.target.value);
          }}
          className="w-full rounded-md border border-line bg-surface-input px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      <Button variant="primary" disabled={!loaded || saving} onClick={save}>
        Save
      </Button>
    </Card>
  );
}
