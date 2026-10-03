import { useEffect, useState } from 'react';
import type { PaymentMethodsEnabledDto } from '@shop/contracts';
import { Alert, Button } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { useSettingsDirty } from '../SettingsDirtyContext.js';
import { useSectionActions } from '../SettingsSectionFrame.js';

type NonCashMethod = 'bank' | 'easypaisa' | 'jazzcash' | 'cheque';

const NON_CASH_METHODS: ReadonlyArray<{ readonly key: NonCashMethod; readonly label: string }> = [
  { key: 'bank', label: 'Bank Transfer' },
  { key: 'easypaisa', label: 'Easypaisa' },
  { key: 'jazzcash', label: 'JazzCash' },
  { key: 'cheque', label: 'Cheque' },
];

/**
 * P17-7 (docs/phases/PHASE_17.md §2.6, S17-EXP-4, A17-5). Follows the
 * exact precedent of DiscountsSettingsSection.tsx
 * (getDiscountPkrEnabled/setDiscountPkrEnabled) — a `saved` snapshot
 * compared against the live draft for dirty-tracking, individual
 * setters called on Save.
 *
 * Cash's own checkbox is permanently checked and disabled — it is
 * never sent to the server at all (there is nothing to send: its
 * value is always `true`). The authoritative enforcement is at the
 * IPC boundary (SetPaymentMethodCashEnabledInput only accepts
 * `{ value: true }`), not this checkbox — this is the UI half only.
 *
 * Hiding a method here is picker-only: PaymentMethodToggle.tsx is the
 * only place this setting is ever read for real. It is NEVER enforced
 * server-side (CreatePaymentInput['method'] stays the same closed Zod
 * union it always was) and never touches a stored historical
 * `payment.method` value — disabling a method here has zero effect on
 * any payment already recorded with it.
 */
export function PaymentMethodsSettingsSection(): React.JSX.Element {
  const { setDirty } = useSettingsDirty();
  const [saved, setSaved] = useState<PaymentMethodsEnabledDto | null>(null);
  const [form, setForm] = useState<PaymentMethodsEnabledDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc.setting
      .getPaymentMethodsEnabled()
      .then((value) => {
        setSaved(value);
        setForm(value);
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

  function toggle(method: NonCashMethod): void {
    setForm((prev) => (prev ? { ...prev, [method]: !prev[method] } : prev));
  }

  async function save(): Promise<void> {
    if (!form) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Cash is never sent — there is nothing to send, its value never
      // changes. Only the four non-cash setters run.
      await Promise.all([
        ipc.setting.setPaymentMethodBankEnabled({ value: form.bank }),
        ipc.setting.setPaymentMethodEasypaisaEnabled({ value: form.easypaisa }),
        ipc.setting.setPaymentMethodJazzcashEnabled({ value: form.jazzcash }),
        ipc.setting.setPaymentMethodChequeEnabled({ value: form.cheque }),
      ]);
      setSaved(form);
      setMessage('Payment methods saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment methods');
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
      <p className="text-sm text-ink-muted">
        Hides a method from the payment screen&apos;s picker only — it is never enforced, and never
        affects any payment already recorded with it.
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-ink-faint">
          <input type="checkbox" checked disabled />
          Cash (cannot be disabled)
        </label>
        {NON_CASH_METHODS.map((m) => (
          <label key={m.key} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form?.[m.key] ?? true}
              disabled={loading || saving}
              onChange={() => {
                toggle(m.key);
              }}
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}
