import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Qty } from '@shop/shared';
import { EmptyState } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { ItemProductCard } from './ItemProductCard.js';
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

/** Left-panel item search: filter tabs, POS product card grid (E-4), and the inline qty step. No cart/checkout logic — that stays in SalePage. */
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
  const [gridItems, setGridItems] = useState<readonly ItemDto[]>([]);

  const searchSelectRef = useRef<SearchSelectHandle>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // E-4: populate the grid on load — top-selling items, falling back to
  // "every item" (item:search with an empty query) for a brand-new shop
  // with no sales yet. One-time fetch; filterTab re-filters client-side
  // below rather than re-fetching.
  useEffect(() => {
    let cancelled = false;
    ipc.item
      .topSelling({ limit: 12 })
      .then((rows) => (rows.length > 0 ? rows : ipc.item.search({ query: '', categoryId: null })))
      .then((rows) => {
        if (!cancelled) setGridItems(rows);
      })
      .catch(() => {
        // Grid stays empty — the search box still works independently.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initialResults = useMemo(
    () => gridItems.filter((item) => itemMatchesTab(item, filterTab, lookups)),
    [gridItems, filterTab, lookups],
  );

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
      inputTone="accent"
      resultsLayout="grid"
      placeholder="Search items — name or code"
      search={searchItems}
      initialResults={initialResults}
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
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                filterTab === tab.key
                  ? 'border-pos-accent-border bg-pos-accent-subtle text-pos-accent'
                  : 'border-transparent bg-surface-input text-ink-muted hover:text-ink'
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
      renderItem={(item, highlighted) =>
        item.id === pendingItem?.id ? (
          <div className="flex h-full flex-col gap-1.5 rounded-xl border-[1.5px] border-pos-accent bg-pos-accent-subtle p-2.5">
            <p className="truncate text-callout font-semibold text-ink">{item.nameEn}</p>
            <span className="truncate font-mono text-caption text-ink-faint">{item.itemCode}</span>
            <div className="flex items-center gap-1">
              <input
                ref={qtyInputRef}
                inputMode="decimal"
                value={qtyInput}
                onChange={(e) => {
                  setQtyInput(e.target.value);
                }}
                onClick={(e) => {
                  // Card click-through would otherwise re-trigger card selection.
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
                className="w-full min-w-0 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus:border-pos-accent focus:outline-none focus:ring-[3px] focus:ring-pos-accent/10"
              />
            </div>
            <p className="truncate text-caption text-ink-muted">
              {saleUnit === 'alt' && pendingItem.altUomId !== null
                ? uomName(pendingItem.altUomId)
                : uomName(pendingItem.stockUomId)}
              {pendingItem.altUomId !== null && ' — ←/→'}
            </p>
            <span className="mt-auto flex items-center gap-1 text-caption text-ink-faint">
              <kbd className="rounded border border-line-strong bg-surface-page px-1 py-0.5 font-mono text-caption">
                Enter
              </kbd>
              to add
            </span>
          </div>
        ) : (
          <ItemProductCard item={item} lookups={lookups} selected={highlighted} />
        )
      }
      renderEmpty={() => <EmptyState message="No items found" />}
    />
  );
}
