import { useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { CustomerPopover } from './CustomerPopover.js';
import { CustomerStrip } from './CustomerStrip.js';

export interface CustomerSearchSlotProps {
  readonly selectedCustomer: CustomerDto | null;
  /** Called with the chosen customer, or null for walk-in. */
  readonly onSelect: (customer: CustomerDto | null) => void;
  /** Called when "Remove" is clicked on the named-customer strip. */
  readonly onRemove: () => void;
  /** Focus target once a customer is chosen or walk-in is confirmed. */
  readonly paymentModeRef: React.RefObject<HTMLDivElement>;
}

/**
 * The customer strip stays visible at all times; "Change" opens a small
 * floating popover anchored below it instead of replacing the strip.
 * Cart/checkout logic stays in SalePage.
 */
export function CustomerSearchSlot({
  selectedCustomer,
  onSelect,
  onRemove,
  paymentModeRef,
}: CustomerSearchSlotProps): React.JSX.Element {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <div className="relative mb-3">
      <p className="mb-1 text-sm font-medium text-ink-muted">Customer</p>
      <CustomerStrip
        customer={selectedCustomer}
        onChange={() => {
          setPopoverOpen(true);
        }}
        onRemove={onRemove}
      />
      {popoverOpen && (
        <CustomerPopover
          onSelect={(customer) => {
            onSelect(customer);
            paymentModeRef.current?.focus();
          }}
          onClose={() => {
            setPopoverOpen(false);
          }}
        />
      )}
    </div>
  );
}
