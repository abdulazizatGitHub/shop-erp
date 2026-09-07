import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Qty } from '@shop/shared';
import { EmptyState } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { ItemResultRow } from './ItemResultRow.js';
import { SearchSelect, type SearchSelectHandle } from './SearchSelect.js';

type FilterTab = 'all' | 'parts' | 'repair';
type SaleUnit = 'stock' | 'alt';

const FILTER_TABS: readonly { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'parts', label: 'Parts' },
  { key: 'repair', label: 'Repair' },
];

/** Which business-unit code a filter tab matches — resolved client-side from lookups, no new IPC. */
function itemMatchesTab(item: ItemDto, tab: FilterTab, lookups: ItemLookups | null): boolean {
  if (tab === 'all') return true;
  const unit = lookups?.businessUnits.find((u) => u.id === item.businessUnitId);
  if (!unit) return false;
  return tab === 'parts' ? unit.code === 'PARTS' : unit.code === 'REPAIR';
}

export interface ItemSearchPanelProps {
  readonly lookups: ItemLookups | null;
  readonly uomName: (id: string) => string;
  readonly onConfirmLine: (item: ItemDto, quantityMilli: number, saleUnit: SaleUnit) => void;
  readonly onCheckoutTrigger: () => void;
  readonly onError: (message: string) => void;
}

/** Left-panel item search: filter tabs, keyboard-navigable results, and the inline qty step. No cart/checkout logic — that stays in SalePage. */
export function ItemSearchPanel({
  lookups,
  uomName,
  onConfirmLine,
  onCheckoutTrigger,
  onError,
}: ItemSearchPanelProps): React.JSX.Element {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [pendingItem, setPendingItem] = useState<ItemDto | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [saleUnit, setSaleUnit] = useState<SaleUnit>('stock');

  const searchSelectRef = useRef<SearchSelectHandle>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Stable identity across re-renders (e.g. every keystroke in the inline
  // qty input, which re-renders this component while a row is held).
  // SearchSelect's debounce is memoized on this function's identity — an
  // inline arrow function here would rebuild that debounce on every such
  // render, re-triggering its "run the search" effect for the still-set
  // query even though nothing about the query changed, and repopulating
  // the results dropdown with stale matches after it was cleared.
  const searchItems = useCallback(
    (query: string) =>
      ipc.item
        .search({ query, categoryId: null })
        .then((rows) => rows.filter((item) => itemMatchesTab(item, filterTab, lookups))),
    [filterTab, lookups],
  );

  useEffect(() => {
    if (pendingItem) {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }
  }, [pendingItem?.id]);

  function cancelPending(): void {
    searchSelectRef.current?.releaseHeld();
    searchSelectRef.current?.focusInput();
    setPendingItem(null);
    setQtyInput('1');
    setSaleUnit('stock');
  }

  function confirmPending(): void {
    if (!pendingItem) return;
    let quantityMilli: number;
    try {
      quantityMilli = Qty.fromUnits(qtyInput);
    } catch {
      onError('Quantity is not a valid amount');
      return;
    }
    if (quantityMilli <= 0) {
      onError('Quantity must be greater than zero');
      return;
    }
    onConfirmLine(pendingItem, quantityMilli, saleUnit);
    cancelPending();
  }

  return (
    <SearchSelect<ItemDto>
      ref={searchSelectRef}
      autoFocus
      placeholder="Search items (Enter on empty to confirm line)"
      search={searchItems}
      getKey={(item) => item.id}
      getLabel={(item) => `${item.nameEn} (${item.itemCode})`}
      holdSelection={() => true}
      belowInput={
        <div className="my-2 flex gap-1" role="tablist" aria-label="Item type filter">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filterTab === tab.key}
              onClick={() => {
                setFilterTab(tab.key);
              }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filterTab === tab.key
                  ? 'bg-brand text-white'
                  : 'bg-surface-input text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
      onSelect={(item) => {
        setPendingItem(item);
        setQtyInput('1');
        setSaleUnit('stock');
      }}
      onEmptyEnter={onCheckoutTrigger}
      renderItem={(item) =>
        item.id === pendingItem?.id ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="truncate font-medium text-ink">{item.nameEn}</p>
              <span className="shrink-0 text-xs text-ink-faint">{item.itemCode}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-muted">Qty:</span>
              <input
                ref={qtyInputRef}
                inputMode="decimal"
                value={qtyInput}
                onChange={(e) => {
                  setQtyInput(e.target.value);
                }}
                onClick={(e) => {
                  // Row click-through would otherwise re-trigger row selection.
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmPending();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelPending();
                  } else if (
                    pendingItem.altUomId !== null &&
                    (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
                  ) {
                    e.preventDefault();
                    setSaleUnit((u) => (u === 'stock' ? 'alt' : 'stock'));
                  }
                }}
                className="w-24 rounded-md border border-line bg-surface px-2 py-1 font-mono text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
              />
              <span className="text-sm text-ink-muted">
                {saleUnit === 'alt' && pendingItem.altUomId !== null
                  ? uomName(pendingItem.altUomId)
                  : uomName(pendingItem.stockUomId)}
              </span>
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-faint">
                <kbd className="rounded border border-line bg-surface-input px-1.5 py-0.5 font-mono">
                  Enter
                </kbd>
                to add
              </span>
            </div>
            {pendingItem.altUomId !== null && (
              <p className="mt-1 text-xs text-ink-faint">
                {saleUnit === 'stock' ? '● ' : '○ '}
                {uomName(pendingItem.stockUomId)} (Stock)&nbsp;&nbsp;
                {saleUnit === 'alt' ? '● ' : '○ '}
                {uomName(pendingItem.altUomId)} (Alt) — ←/→ to switch
              </p>
            )}
          </div>
        ) : (
          <ItemResultRow item={item} lookups={lookups} uomName={uomName} />
        )
      }
      renderEmpty={() => <EmptyState message="No items found" />}
    />
  );
}
