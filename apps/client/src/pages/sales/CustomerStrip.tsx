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
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  );
}

/**
 * Icon-only edit/remove buttons — this strip lives in a ~200px-wide right
 * panel at the app's real 800x600 default window size, where a text-label
 * button ("Change"/"Remove") left almost no width for the customer name
 * itself (measured: 21px). aria-label/title keep them accessible without
 * the visible label.
 */
function EditIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function RemoveIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
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
      <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-dashed border-line-strong bg-surface-input px-2.5 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface text-ink-faint">
          <UserIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">Walk-in customer</p>
          <p className="truncate text-[11px] text-ink-faint">No account — cash only</p>
        </div>
        <button
          type="button"
          onClick={onChange}
          aria-label="Change customer"
          title="Change customer"
          className="shrink-0 rounded p-1 text-pos-accent hover:bg-surface"
        >
          <EditIcon />
        </button>
      </div>
    );
  }

  const typeLabel = customer.customerType ? CUSTOMER_TYPE_LABEL[customer.customerType] : null;

  return (
    <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-pos-accent-border bg-pos-accent-subtle px-2.5 py-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-pos-accent">
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
        aria-label="Remove customer"
        title="Remove customer"
        className="shrink-0 rounded p-1 text-danger hover:bg-surface"
      >
        <RemoveIcon />
      </button>
    </div>
  );
}
