import { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput } from '@shop/ui';
import { debounce } from '../../lib/debounce.js';

/**
 * Generic keyboard-navigable type-ahead select. Shared between item
 * search (Step A) and customer search (Step D's checkout) — both are the
 * same interaction shape: type, debounced search, arrow keys move the
 * highlight, Enter selects.
 */
export interface SearchSelectProps<T> {
  readonly autoFocus?: boolean;
  readonly placeholder: string;
  readonly search: (query: string) => Promise<readonly T[]>;
  readonly getKey: (item: T) => string;
  readonly getLabel: (item: T) => string;
  readonly onSelect: (item: T) => void;
  /** Enter pressed with an empty query and no results — e.g. checkout trigger or "walk-in". */
  readonly onEmptyEnter?: () => void;
  readonly inputRef?: React.RefObject<HTMLInputElement>;
  /**
   * Optional richer per-result row (e.g. multi-column: name/code/price/unit).
   * Falls back to a plain `getLabel(item)` text row when not given, so
   * every existing caller (SuppliersPage, PurchasePage) is unaffected.
   */
  readonly renderItem?: (item: T, highlighted: boolean) => React.ReactNode;
  /** Shown below the input when a non-empty search returns zero results. */
  readonly renderEmpty?: () => React.ReactNode;
}

export function SearchSelect<T>({
  autoFocus,
  placeholder,
  search,
  getKey,
  getLabel,
  onSelect,
  onEmptyEnter,
  inputRef,
  renderItem,
  renderEmpty,
}: SearchSelectProps<T>): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly T[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const ownRef = useRef<HTMLInputElement>(null);
  const effectiveRef = inputRef ?? ownRef;

  const debouncedSearch = useMemo(
    () =>
      debounce((q: string) => {
        search(q)
          .then((rows) => {
            setResults(rows);
            setHighlighted(0);
          })
          .catch(() => {
            setResults([]);
          });
      }, 200),
    [search],
  );

  useEffect(() => {
    // An empty query must show nothing, not "every row" — item.search /
    // customer.search treat '' as no filter and return everything, which
    // is correct for those IPC calls but wrong for a closed/untouched
    // dropdown. Skip the call entirely rather than special-case the result.
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  function selectAndReset(item: T): void {
    onSelect(item);
    setQuery('');
    setResults([]);
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Escape') {
      // Clears the results list only — no stopPropagation, so a parent's
      // own Escape handler (e.g. cancelling a pending item/quantity step)
      // still fires. Focus stays on the input; nothing here moves it.
      event.preventDefault();
      setResults([]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const picked = results[highlighted];
      if (picked) {
        selectAndReset(picked);
      } else if (query.trim().length === 0) {
        onEmptyEnter?.();
      } else {
        // BUG-C fix (found P4-1d real-hardware testing): results[] is
        // populated by a 200ms-debounced async search. A fast typist —
        // exactly what this keyboard-driven counter is built for —
        // can press Enter before that search resolves. With nothing
        // highlighted yet, this branch used to do nothing at all: no
        // selection, no feedback, the field silently stayed on
        // Walk-in. Run the search right now instead of waiting for
        // the debounce, and act on its real result once it arrives.
        search(query)
          .then((rows) => {
            setResults(rows);
            setHighlighted(0);
            const firstMatch = rows[0];
            if (firstMatch) {
              selectAndReset(firstMatch);
            }
            // else: genuinely zero matches — rows now shows that in
            // the UI instead of leaving the user with no feedback.
          })
          .catch(() => {
            setResults([]);
          });
      }
    }
  };

  return (
    <div>
      <TextInput
        ref={effectiveRef}
        variant="search"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
      />
      {results.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-md border border-line">
          {results.map((item, index) => {
            const isHighlighted = index === highlighted;
            return (
              <li key={getKey(item)}>
                <button
                  type="button"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => {
                    setHighlighted(index);
                  }}
                  onClick={() => {
                    selectAndReset(item);
                  }}
                  className={`block w-full border-b border-line px-3 py-2 text-left text-sm last:border-b-0 ${
                    isHighlighted ? 'bg-brand-subtle' : 'hover:bg-surface-sunken'
                  }`}
                >
                  {renderItem ? renderItem(item, isHighlighted) : getLabel(item)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {results.length === 0 && query.trim().length > 0 && renderEmpty?.()}
    </div>
  );
}
