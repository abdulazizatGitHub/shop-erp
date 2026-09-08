import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { debounce } from '../../lib/debounce.js';

export interface CustomerPopoverProps {
  /** Called with the chosen customer, or null for walk-in. */
  readonly onSelect: (customer: CustomerDto | null) => void;
  readonly onClose: () => void;
}

/**
 * Small floating panel anchored below the customer strip: search input,
 * a "Walk-in (no account)" row, and a scrollable results list. Owns its
 * own query/results state — unlike SearchSelect, there is no keyboard
 * highlight/arrow-navigation here, just a simple click-to-pick list.
 */
export function CustomerPopover({ onSelect, onClose }: CustomerPopoverProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly CustomerDto[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useMemo(
    () =>
      debounce((q: string) => {
        ipc.customer
          .search({ query: q })
          .then(setResults)
          .catch(() => {
            setResults([]);
          });
      }, 200),
    [],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  useEffect(() => {
    function onMouseDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Change customer"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-line bg-surface p-2 shadow-lg"
    >
      <TextInput
        ref={inputRef}
        variant="search"
        placeholder="Search customer"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <ul className="mt-2 max-h-[320px] overflow-y-auto">
        <li>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className="block w-full rounded-md border-b border-line px-3 py-2 text-left text-sm hover:bg-surface-sunken"
          >
            Walk-in (no account)
          </button>
        </li>
        {results.map((customer) => (
          <li key={customer.id}>
            <button
              type="button"
              onClick={() => {
                onSelect(customer);
                onClose();
              }}
              className="block w-full border-b border-line px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-sunken"
            >
              {customer.shopName ? `${customer.name} — ${customer.shopName}` : customer.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
