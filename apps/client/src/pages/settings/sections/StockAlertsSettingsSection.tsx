import { useEffect, useState } from 'react';
import type { NegativeStockPolicy } from '../../../types/electron-api.js';
import { Alert, Button } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { useSettingsDirty } from '../SettingsDirtyContext.js';
import { useSectionActions } from '../SettingsSectionFrame.js';

/**
 * P17-1 (docs/phases/PHASE_17.md §2.1, Q17-6). One setting,
 * negativeStockPolicy, for counter sales only — governs both the
 * already-≤0 add-to-cart case and the exceeds-on-hand-at-commit case.
 * P17-2 (low-stock badge/threshold) extends this same section later;
 * not built this task.
 */
export function StockAlertsSettingsSection(): React.JSX.Element {
  const { setDirty } = useSettingsDirty();
  const [saved, setSaved] = useState<NegativeStockPolicy | null>(null);
  const [policy, setPolicy] = useState<NegativeStockPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc.setting
      .getNegativeStockPolicy()
      .then((value) => {
        setSaved(value);
        setPolicy(value);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });
  }, []);

  const loading = policy === null;
  const dirty = policy !== null && saved !== null && policy !== saved;

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  async function save(): Promise<void> {
    if (!policy) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await ipc.setting.setNegativeStockPolicy({ value: policy });
      setSaved(policy);
      setMessage('Stock & alerts settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stock & alerts settings.');
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
      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">
          When a counter sale would take an item&apos;s stock below zero
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={policy === 'warn' ? 'primary' : 'secondary'}
            size="large"
            disabled={loading || saving}
            onClick={() => {
              setPolicy('warn');
            }}
          >
            Warn, but allow (default)
          </Button>
          <Button
            variant={policy === 'block' ? 'primary' : 'secondary'}
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
    </div>
  );
}
