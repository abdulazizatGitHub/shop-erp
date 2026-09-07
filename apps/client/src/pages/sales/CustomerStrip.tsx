import { useEffect, useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { MoneyDisplay } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const CUSTOMER_TYPE_LABEL: Record<NonNullable<CustomerDto['customerType']>, string> = {
  retail: 'Retail',
  wholesale: 'Wholesale',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts[1]?.charAt(0) ?? '';
  return (first + second).toUpperCase() || '?';
}

function UserIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  );
}

export interface CustomerStripProps {
  readonly customer: CustomerDto | null;
  readonly onChange: () => void;
  readonly onRemove: () => void;
}

/** Walk-in vs. named customer display. The customer search itself stays in SalePage — this is display-only. */
export function CustomerStrip({
  customer,
  onChange,
  onRemove,
}: CustomerStripProps): React.JSX.Element {
  const [balancePaisa, setBalancePaisa] = useState<number | null>(null);

  useEffect(() => {
    if (!customer) {
      setBalancePaisa(null);
      return;
    }
    let cancelled = false;
    ipc.customer
      .balance(customer.id)
      .then((result) => {
        if (!cancelled) setBalancePaisa(result.balancePaisa);
      })
      .catch(() => {
        if (!cancelled) setBalancePaisa(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customer?.id]);

  if (!customer) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface-input text-ink-faint">
          <UserIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">Walk-in customer</p>
          <p className="text-[11px] text-ink-faint">No account — cash only</p>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="shrink-0 text-xs font-medium text-brand hover:underline"
        >
          ✎ Change
        </button>
      </div>
    );
  }

  const typeLabel = customer.customerType ? CUSTOMER_TYPE_LABEL[customer.customerType] : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand/40 bg-surface px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-bold text-brand">
        {initials(customer.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink">
          {customer.name}
          {typeLabel && <span className="ml-1 font-normal text-ink-faint">({typeLabel})</span>}
        </p>
        {balancePaisa !== null && (
          <p className="truncate whitespace-nowrap text-[11px] text-ink-faint">
            Outstanding: <MoneyDisplay paisaValue={balancePaisa} size="sm" />
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-xs font-medium text-danger hover:underline"
      >
        ✕ Remove
      </button>
    </div>
  );
}
