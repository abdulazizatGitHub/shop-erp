import { useEffect, useState } from 'react';
import { Banknote, Building2, FileText, Smartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CreatePaymentInput, PaymentMethodsEnabledDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';

type PaymentMethod = CreatePaymentInput['method'];

const PAYMENT_METHODS: ReadonlyArray<{
  readonly value: PaymentMethod;
  readonly label: string;
  readonly icon: LucideIcon;
}> = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'bank', label: 'Bank Transfer', icon: Building2 },
  { value: 'easypaisa', label: 'Easypaisa', icon: Smartphone },
  { value: 'jazzcash', label: 'JazzCash', icon: Smartphone },
  { value: 'cheque', label: 'Cheque', icon: FileText },
];

// P17-7 (docs/phases/PHASE_17.md §2.6, S17-EXP-4). Shown until the one
// IPC read resolves — every method enabled is also the real default
// (A17-5), so there's no flash-of-wrong-content while loading.
const ALL_ENABLED: PaymentMethodsEnabledDto = {
  cash: true,
  bank: true,
  easypaisa: true,
  jazzcash: true,
  cheque: true,
};

// Same active/inactive pill pattern as DateRangeSelector.tsx's presets.
const INACTIVE_TOGGLE_CLASS =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand';
const ACTIVE_TOGGLE_CLASS =
  'rounded-md border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors';

export interface PaymentMethodToggleProps {
  readonly value: PaymentMethod;
  readonly onChange: (method: PaymentMethod) => void;
}

/**
 * Extracted from RecordPaymentModal.tsx (5C) — payment method as a
 * button toggle group, not a dropdown.
 *
 * P17-7 (docs/phases/PHASE_17.md §2.6, S17-EXP-4). Owns its own read of
 * `setting:getPaymentMethodsEnabled` — "hiding a method is picker-
 * only" (the plan's own wording) means the picker itself is the right
 * place to own this, so every current and future caller gets it
 * automatically with no changes on their side. A disabled method is
 * hidden from the list entirely; if `value` currently points at a
 * method that becomes disabled, this falls back to `'cash'` (which can
 * never itself be disabled, A17-5) via `onChange`.
 */
export function PaymentMethodToggle({
  value,
  onChange,
}: PaymentMethodToggleProps): React.JSX.Element {
  const [enabled, setEnabled] = useState<PaymentMethodsEnabledDto>(ALL_ENABLED);

  useEffect(() => {
    ipc.setting
      .getPaymentMethodsEnabled()
      .then(setEnabled)
      .catch(() => {
        // A failed read is never worth breaking the payment form over —
        // every method just stays shown, same as the real default.
      });
  }, []);

  useEffect(() => {
    if (!enabled[value]) {
      onChange('cash');
    }
  }, [enabled, value, onChange]);

  const visibleMethods = PAYMENT_METHODS.filter((m) => enabled[m.value]);

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-muted">Payment method</p>
      <div className="flex flex-wrap gap-2">
        {visibleMethods.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => {
              onChange(m.value);
            }}
            className={`inline-flex items-center gap-1.5 ${value === m.value ? ACTIVE_TOGGLE_CLASS : INACTIVE_TOGGLE_CLASS}`}
          >
            <m.icon size={14} aria-hidden="true" />
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
