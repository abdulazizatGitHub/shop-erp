import { useEffect, useState } from 'react';
import type { NegativeStockPolicy } from '../../../types/electron-api.js';
import { Qty } from '@shop/shared';
import { Alert, Button, TextInput } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { useSettingsDirty } from '../SettingsDirtyContext.js';
import { useSectionActions } from '../SettingsSectionFrame.js';

interface FormState {
  readonly policy: NegativeStockPolicy;
  /** Whole-unit display string the owner types — converted to milli only at save time (Qty.fromUnits), never earlier. */
  readonly lowStockThresholdDraft: string;
}

/**
 * P17-1 (docs/phases/PHASE_17.md §2.1, Q17-6): negativeStockPolicy, for
 * counter sales only. P17-2 (§2.2, S17-ITEM-2) adds the shop-wide
 * low-stock threshold — used as the fallback when an item's own
 * reorder_level (set via CSV import) is null.
 */
export function StockAlertsSettingsSection(): React.JSX.Element {
  const { setDirty } = useSettingsDirty();
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([ipc.setting.getNegativeStockPolicy(), ipc.setting.getDefaultLowStockThreshold()])
      .then(([policy, thresholdMilli]) => {
        const loaded: FormState = {
          policy,
          lowStockThresholdDraft: String(Qty.toUnits(Qty.of(thresholdMilli))),
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

  function setPolicy(policy: NegativeStockPolicy): void {
    setForm((prev) => (prev ? { ...prev, policy } : prev));
  }

  function setThresholdDraft(value: string): void {
    setForm((prev) => (prev ? { ...prev, lowStockThresholdDraft: value } : prev));
  }

  async function save(): Promise<void> {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    let thresholdMilli: number;
    try {
      thresholdMilli = Qty.fromUnits(form.lowStockThresholdDraft);
    } catch {
      setSaving(false);
      setError('Default low-stock qty is not a valid amount.');
      return;
    }

    let policyFailed = false;
    let thresholdFailed = false;

    try {
      await ipc.setting.setNegativeStockPolicy({ value: form.policy });
    } catch {
      policyFailed = true;
    }
    try {
      await ipc.setting.setDefaultLowStockThreshold({ value: thresholdMilli });
    } catch {
      thresholdFailed = true;
    }

    setSaving(false);

    if (policyFailed && thresholdFailed) {
      setError('Failed to save negative-stock policy and low-stock threshold.');
      return;
    }
    if (policyFailed) {
      setError('Failed to save negative-stock policy — low-stock threshold was saved.');
      setSaved((prev) =>
        prev ? { ...prev, lowStockThresholdDraft: form.lowStockThresholdDraft } : prev,
      );
      return;
    }
    if (thresholdFailed) {
      setError('Failed to save low-stock threshold — negative-stock policy was saved.');
      setSaved((prev) => (prev ? { ...prev, policy: form.policy } : prev));
      return;
    }

    setSaved(form);
    setMessage('Stock & alerts settings saved.');
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
    <div className="flex flex-col gap-6">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">
          When a counter sale would take an item&apos;s stock below zero
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={form?.policy === 'warn' ? 'primary' : 'secondary'}
            size="large"
            disabled={loading || saving}
            onClick={() => {
              setPolicy('warn');
            }}
          >
            Warn, but allow (default)
          </Button>
          <Button
            variant={form?.policy === 'block' ? 'primary' : 'secondary'}
            size="large"
            disabled={loading || saving}
            onClick={() => {
              setPolicy('block');
            }}
          >
            Block the sale
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Applies to counter sales only — issuing parts to a job, transfers, and cancellations are
          never blocked. During the parallel run, &quot;Warn, but allow&quot; is recommended so a
          stock-count error never stops a sale.
        </p>
      </div>
      <div className="border-t border-line pt-4">
        <TextInput
          label="Default low-stock qty"
          variant="number"
          value={form?.lowStockThresholdDraft ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            setThresholdDraft(e.target.value);
          }}
        />
        <p className="mt-2 text-xs text-ink-muted">
          Used only for items that don&apos;t have their own low-stock quantity set (via CSV
          import). An item at or below this quantity shows as &quot;Low&quot; on the Items list and
          counts toward the Dashboard&apos;s Low Stock card. Default 0 — only an out-of-stock item
          is flagged until you raise this.
        </p>
      </div>
    </div>
  );
}
