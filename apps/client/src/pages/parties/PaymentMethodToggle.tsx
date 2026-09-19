import { Banknote, Building2, FileText, Smartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CreatePaymentInput } from '@shop/contracts';

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

// Same active/inactive pill pattern as DateRangeSelector.tsx's presets.
const INACTIVE_TOGGLE_CLASS =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand';
const ACTIVE_TOGGLE_CLASS =
  'rounded-md border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors';

export interface PaymentMethodToggleProps {
  readonly value: PaymentMethod;
  readonly onChange: (method: PaymentMethod) => void;
}

/** Extracted from RecordPaymentModal.tsx (5C) — payment method as a button toggle group, not a dropdown. */
export function PaymentMethodToggle({
  value,
  onChange,
}: PaymentMethodToggleProps): React.JSX.Element {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-muted">Payment method</p>
      <div className="flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((m) => (
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
