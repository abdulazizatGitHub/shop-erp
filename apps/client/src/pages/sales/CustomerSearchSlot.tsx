import { useCallback, useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';
import { CustomerStrip } from './CustomerStrip.js';
import { SearchSelect } from './SearchSelect.js';

export interface CustomerSearchSlotProps {
  readonly selectedCustomer: CustomerDto | null;
  /** Called with the chosen customer, or null for walk-in (empty-enter). */
  readonly onSelect: (customer: CustomerDto | null) => void;
  /** Called when "Remove" is clicked on the named-customer strip. */
  readonly onRemove: () => void;
  /** Focus target once a customer is chosen or walk-in is confirmed. */
  readonly paymentModeRef: React.RefObject<HTMLDivElement>;
}

/** Toggles between the customer search box and the walk-in/named CustomerStrip. Owns only that toggle — cart/checkout logic stays in SalePage. */
export function CustomerSearchSlot({
  selectedCustomer,
  onSelect,
  onRemove,
  paymentModeRef,
}: CustomerSearchSlotProps): React.JSX.Element {
  const [searchOpen, setSearchOpen] = useState(false);

  // Stable identity — see the matching comment in ItemSearchPanel.tsx's
  // searchItems: an inline arrow function here would rebuild SearchSelect's
  // memoized debounce on every re-render.
  const searchCustomers = useCallback((query: string) => ipc.customer.search({ query }), []);

  return (
    <div className="mb-3">
      <p className="mb-1 text-sm font-medium text-ink-muted">Customer</p>
      {searchOpen ? (
        <SearchSelect<CustomerDto>
          key="customer-search"
          autoFocus
          placeholder="Search customer (Enter on empty = walk-in)"
          search={searchCustomers}
          getKey={(customer) => customer.id}
          getLabel={(customer) =>
            customer.shopName ? `${customer.name} — ${customer.shopName}` : customer.name
          }
          onSelect={(customer) => {
            onSelect(customer);
            setSearchOpen(false);
            paymentModeRef.current?.focus();
          }}
          onEmptyEnter={() => {
            onSelect(null);
            setSearchOpen(false);
            paymentModeRef.current?.focus();
          }}
        />
      ) : (
        <CustomerStrip
          customer={selectedCustomer}
          onChange={() => {
            setSearchOpen(true);
          }}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}
