export interface SearchSelectResultsProps<T> {
  readonly results: readonly T[];
  readonly resultsLayout: 'list' | 'grid';
  readonly inputTone: 'default' | 'accent';
  readonly heldItem: T | null;
  readonly highlighted: number;
  readonly getKey: (item: T) => string;
  readonly renderItem?: ((item: T, highlighted: boolean) => React.ReactNode) | undefined;
  readonly getLabel: (item: T) => string;
  readonly onHoverItem: (index: number) => void;
  readonly onClickItem: (item: T) => void;
}

/**
 * SearchSelect's results list/grid — extracted out to keep SearchSelect.tsx
 * under the 300-line file cap. Purely presentational; all state (query,
 * highlighted index, held item) stays owned by SearchSelect.
 */
export function SearchSelectResults<T>({
  results,
  resultsLayout,
  inputTone,
  heldItem,
  highlighted,
  getKey,
  renderItem,
  getLabel,
  onHoverItem,
  onClickItem,
}: SearchSelectResultsProps<T>): React.JSX.Element | null {
  if (results.length === 0) return null;

  return (
    <ul
      className={
        resultsLayout === 'grid'
          ? 'grid h-[260px] auto-rows-min grid-cols-[repeat(auto-fill,minmax(max(140px,25%),1fr))] gap-2 overflow-hidden'
          : `absolute left-0 right-0 top-full z-40 mt-1 max-h-[320px] overflow-y-auto rounded-md border border-line bg-surface shadow-lg ${
              inputTone === 'accent' ? 'flex flex-col gap-1 p-1' : ''
            }`
      }
    >
      {results.map((item, index) => {
        const isHeld = heldItem !== null && getKey(item) === getKey(heldItem);
        const isHighlighted = isHeld || (heldItem === null && index === highlighted);
        const content = renderItem ? renderItem(item, isHighlighted) : getLabel(item);
        const rowClass =
          resultsLayout === 'grid'
            ? 'block w-full text-left'
            : inputTone === 'accent'
              ? `block w-full rounded-[10px] border-[1.5px] px-3 py-2 text-left text-sm ${
                  isHighlighted
                    ? 'border-pos-accent-border bg-pos-accent-subtle'
                    : 'border-transparent hover:bg-surface-input'
                }`
              : `block w-full border-b border-line px-3 py-2 text-left text-sm last:border-b-0 ${
                  isHighlighted ? 'bg-brand-subtle' : 'hover:bg-surface-sunken'
                }`;

        // Held row: a plain container, not a <button> — it may contain a
        // live focusable input (e.g. the inline qty field), and
        // interactive elements can't legally nest inside a <button>.
        if (isHeld) {
          return (
            <li key={getKey(item)}>
              <div aria-selected="true" className={rowClass}>
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
                if (heldItem === null) onHoverItem(index);
              }}
              onClick={() => {
                onClickItem(item);
              }}
              className={rowClass}
            >
              {content}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
