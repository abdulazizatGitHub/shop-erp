import { useEffect, useMemo, useRef, useState } from 'react';
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
      <input
        ref={effectiveRef}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
      />
      {results.length > 0 && (
        <ul>
          {results.map((item, index) => (
            <li key={getKey(item)}>
              <button
                type="button"
                aria-selected={index === highlighted}
                onMouseEnter={() => {
                  setHighlighted(index);
                }}
                onClick={() => {
                  onSelect(item);
                  setQuery('');
                  setResults([]);
                }}
              >
                {index === highlighted ? '> ' : '  '}
                {getLabel(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
