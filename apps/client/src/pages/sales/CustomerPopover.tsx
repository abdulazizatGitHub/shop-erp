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
  // Index 0 is always the "Walk-in" row; indices 1..results.length follow.
  const [highlighted, setHighlighted] = useState(0);
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
    setHighlighted(0);
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  const rowCount = 1 + results.length;

  function chooseHighlighted(): void {
    if (highlighted === 0) {
      onSelect(null);
    } else {
      const customer = results[highlighted - 1];
      if (!customer) return;
      onSelect(customer);
    }
    onClose();
  }

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
        tone="accent"
        placeholder="Search customer"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, rowCount - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            chooseHighlighted();
          }
        }}
      />
      <ul className="mt-2 flex max-h-[320px] flex-col gap-1 overflow-y-auto">
        <li>
          <button
            type="button"
            aria-selected={highlighted === 0}
            onMouseEnter={() => {
              setHighlighted(0);
            }}
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className={`block w-full rounded-[10px] border-[1.5px] px-3 py-2 text-left text-sm ${
              highlighted === 0
                ? 'border-pos-accent-border bg-pos-accent-subtle'
                : 'border-transparent hover:bg-surface-input'
            }`}
          >
            Walk-in (no account)
          </button>
        </li>
        {results.map((customer, index) => (
          <li key={customer.id}>
            <button
              type="button"
              aria-selected={highlighted === index + 1}
              onMouseEnter={() => {
                setHighlighted(index + 1);
              }}
              onClick={() => {
                onSelect(customer);
                onClose();
              }}
              className={`block w-full rounded-[10px] border-[1.5px] px-3 py-2 text-left text-sm ${
                highlighted === index + 1
                  ? 'border-pos-accent-border bg-pos-accent-subtle'
                  : 'border-transparent hover:bg-surface-input'
              }`}
            >
              {customer.shopName ? `${customer.name} — ${customer.shopName}` : customer.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
