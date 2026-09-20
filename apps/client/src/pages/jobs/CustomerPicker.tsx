import { useEffect, useRef, useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const SEARCH_DEBOUNCE_MS = 300;

export interface CustomerPickerProps {
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** Set when staff picks an existing customer from the dropdown (or the
   * name+phone dedup check in JobCreateForm auto-matches one). Cleared
   * (back to free-typing) when staff edits the name again. */
  readonly selected: CustomerDto | null;
  readonly onSelect: (customer: CustomerDto) => void;
  readonly onClearSelection: () => void;
}

/**
 * P14-2 — search-or-create customer picker for job intake. OD-4: dedup
 * disambiguator is name AND phone together, never name alone — every
 * dropdown row shows phone alongside name so staff can tell two
 * customers named "Khalid" apart. Search is name-only (customer:search
 * has no phone parameter — confirmed by reading packages/contracts/src/
 * party/customer.ts's CustomerSearchInput before building this); the
 * stronger name+phone exact-match dedup (auto-select, no dropdown click
 * needed) happens in JobCreateForm once the separate Phone field is also
 * filled in, not here.
 */
export function CustomerPicker({
  name,
  onNameChange,
  selected,
  onSelect,
  onClearSelection,
}: CustomerPickerProps): React.JSX.Element {
  const [results, setResults] = useState<readonly CustomerDto[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected) {
      setOpen(false);
      return;
    }
    if (name.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      ipc.customer
        .search({ query: name.trim() })
        .then((rows) => {
          setResults(rows);
          setOpen(true);
        })
        .catch(() => {
          setResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [name, selected]);

  if (selected) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-ink">Client</p>
        <div className="flex items-center justify-between rounded-md border border-line bg-surface-sunken px-3 py-2">
          <div>
            <p className="text-sm font-medium text-ink">{selected.name}</p>
            <p className="text-xs text-ink-faint">{selected.phone ?? 'no phone on file'}</p>
          </div>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Using existing customer
          </span>
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          className="mt-1 text-xs text-ink-faint underline hover:text-ink"
        >
          Not this customer? Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <TextInput
        label="Client"
        required
        autoFocus
        placeholder="Search by name, or type a new customer's name"
        value={name}
        onChange={(e) => {
          onNameChange(e.target.value);
        }}
        onFocus={() => {
          if (results.length > 0 || name.trim().length > 0) setOpen(true);
        }}
        onBlur={() => {
          // Delay so a click on a dropdown row registers before it unmounts.
          setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-lg">
          {results.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(customer);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-surface-sunken"
            >
              <span className="font-medium text-ink">{customer.name}</span>
              <span className="text-xs text-ink-faint">{customer.phone ?? 'no phone on file'}</span>
            </button>
          ))}
          {name.trim().length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="w-full border-t border-line px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface-sunken"
            >
              Create new customer: “{name.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
