import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
  /**
   * When this returns true for the selected item, SearchSelect "holds" that
   * item instead of the normal select-and-reset: query/results stay in
   * place, arrow-key navigation is disabled, and the held row is rendered
   * as a plain (non-button) container so renderItem can put a live,
   * focusable input inside it (e.g. an inline quantity field) without
   * nesting interactive elements inside a <button>. The caller releases
   * the hold via the imperative handle (see SearchSelectHandle).
   */
  readonly holdSelection?: (item: T) => boolean;
  /** Rendered between the search input and the results list — e.g. filter tabs. Purely presentational, no state or keyboard logic of its own. */
  readonly belowInput?: React.ReactNode;
}

export interface SearchSelectHandle {
  /** Clears the held item plus query/results — used both for Esc-while-held and after a successful confirm. */
  releaseHeld: () => void;
  /** Refocuses the search input — needed after confirming/canceling a held row, since SearchSelect stays mounted (no autoFocus remount) once a row can be held in place. */
  focusInput: () => void;
}

function SearchSelectInner<T>(
  {
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
    holdSelection,
    belowInput,
  }: SearchSelectProps<T>,
  ref: React.Ref<SearchSelectHandle>,
): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly T[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [heldItem, setHeldItem] = useState<T | null>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const effectiveRef = inputRef ?? ownRef;
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Closes the floating results dropdown when the user clicks anywhere
  // outside this component — the input, the filter row, and the dropdown
  // itself are all inside containerRef, so a click there is never "outside".
  useEffect(() => {
    function onMouseDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        releaseHeld();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  function releaseHeld(): void {
    setHeldItem(null);
    setQuery('');
    setResults([]);
  }

  useImperativeHandle(
    ref,
    () => ({
      releaseHeld,
      focusInput: () => {
        effectiveRef.current?.focus();
      },
    }),
    [effectiveRef],
  );

  function resetAfterSelect(): void {
    setQuery('');
    setResults([]);
  }

  /** Enter/Tab/click all resolve a picked item through this — holds it if the caller asked to, otherwise the normal select-and-reset. */
  function chooseItem(item: T): void {
    onSelect(item);
    if (holdSelection?.(item)) {
      setHeldItem(item);
    } else {
      setHeldItem(null);
      resetAfterSelect();
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      if (heldItem) return; // nav disabled while a row is held
      event.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      if (heldItem) return;
      event.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Escape') {
      // Clears the dropdown, the query text, and any held item — no
      // stopPropagation, so a parent's own Escape handler still fires.
      // Focus stays on the input; nothing here moves it.
      event.preventDefault();
      releaseHeld();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      if (heldItem) return; // a row is already held; nothing left to select from this input
      // Tab acts as Enter here (keyboard-first counter flow — the brief's
      // spec) when there's an actual result to select or a search still in
      // flight. But on a genuinely empty query, Tab must NOT also trigger
      // onEmptyEnter (checkout) the way Enter does — K-15's audit found
      // that with a non-empty cart and an empty search box, this made Tab
      // silently submit the sale instead of moving focus to the next
      // field, which conflicts with normal tab-order navigation through
      // the checkout panel. Enter alone keeps that shortcut; Tab falls
      // through to the browser's default focus movement.
      const picked = results[highlighted];
      if (picked) {
        event.preventDefault();
        chooseItem(picked);
      } else if (query.trim().length === 0) {
        if (event.key === 'Enter') {
          event.preventDefault();
          onEmptyEnter?.();
        }
      } else {
        event.preventDefault();
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
              chooseItem(firstMatch);
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
    <div ref={containerRef} className="relative">
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
      {belowInput}
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[320px] overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {results.map((item, index) => {
            const isHeld = heldItem !== null && getKey(item) === getKey(heldItem);
            const isHighlighted = isHeld || (heldItem === null && index === highlighted);
            const content = renderItem ? renderItem(item, isHighlighted) : getLabel(item);

            // Held row: a plain container, not a <button> — it may contain
            // a live focusable input (e.g. the inline qty field), and
            // interactive elements can't legally nest inside a <button>.
            if (isHeld) {
              return (
                <li key={getKey(item)}>
                  <div
                    aria-selected="true"
                    className="block w-full border-b border-line bg-brand-subtle px-3 py-2 text-left text-sm last:border-b-0"
                  >
                    {content}
                  </div>
                </li>
              );
            }

            return (
              <li key={getKey(item)}>
                <button
                  type="button"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => {
                    if (heldItem === null) setHighlighted(index);
                  }}
                  onClick={() => {
                    chooseItem(item);
                  }}
                  className={`block w-full border-b border-line px-3 py-2 text-left text-sm last:border-b-0 ${
                    isHighlighted ? 'bg-brand-subtle' : 'hover:bg-surface-sunken'
                  }`}
                >
                  {content}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {results.length === 0 && query.trim().length > 0 && renderEmpty && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-line bg-surface shadow-lg">
          {renderEmpty()}
        </div>
      )}
    </div>
  );
}

export const SearchSelect = forwardRef(SearchSelectInner) as <T>(
  props: SearchSelectProps<T> & { ref?: React.Ref<SearchSelectHandle> },
) => React.JSX.Element;
