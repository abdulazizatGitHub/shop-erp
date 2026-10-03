import { useEffect, useMemo, useState } from 'react';
import { Package, Search } from 'lucide-react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import {
  Button,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
  useToast,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { AddItemModal } from './AddItemModal.js';
import { ImportItemsModal } from './ImportItemsModal.js';
import { ImportOpeningStockModal } from './ImportOpeningStockModal.js';
import { ItemPriceHistoryModal } from './ItemPriceHistoryModal.js';
import { ItemsTableRow } from './ItemsTableRow.js';

export interface ItemsPageProps {
  /**
   * P17-2 review round 2, item 3: the Dashboard low-stock widget's click
   * should open Items with the filter already ON (Q17-3, as approved) —
   * not just switch tabs and leave the owner to tick the checkbox
   * themselves. Seeds the internal `lowStockOnly` state only at mount —
   * ItemsPage remounts fresh every time App.tsx's tab switches away from
   * and back to 'items' (see App.tsx's handleSelectTab, which resets this
   * back to false for a direct sidebar/keyboard tab switch).
   */
  readonly initialLowStockOnly?: boolean;
}

export function ItemsPage({ initialLowStockOnly = false }: ItemsPageProps): React.JSX.Element {
  const { showToast } = useToast();
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [items, setItems] = useState<readonly ItemDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(initialLowStockOnly);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importOpeningStockOpen, setImportOpeningStockOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<ItemDto | null>(null);

  // P4.5-3: the full list is loaded once — the search box below filters it
  // in memory, not with a new IPC call per keystroke.
  const loadItems = (): void => {
    ipc.item
      .search({ query: '', categoryId: null })
      .then(setItems)
      .catch((err: unknown) => {
        showToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to load items',
        });
      });
  };

  useEffect(() => {
    ipc.item
      .lookups()
      .then(setLookups)
      .catch((err: unknown) => {
        showToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to load lookups',
        });
      });
    loadItems();
  }, []);

  // P17-2 review fix, extended P17-2b: `stockAlert` is a plain
  // server-computed field on ItemDto (item.repository.ts, via
  // @shop/core's computeStockAlert) — filtering on it here is a trivial
  // check, not a re-derivation of the rule. "Low stock only" means
  // 'out' + 'low', same scope as the old `isLowStock` boolean —
  // 'not_stocked' items are excluded from this filter (never received
  // isn't "running low"; the Dashboard surfaces that count separately).
  // No pagination exists on this list (loadItems fetches the whole
  // catalogue in one call, no LIMIT anywhere in searchItems' SQL — see
  // item.repository.ts), so this filter always runs over the exact same
  // complete set runLowStockCount() counts over (item.handler.test.ts's
  // "spans more than one page" test proves the two can never disagree).
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = items;
    if (q.length > 0) {
      result = result.filter(
        (item) => item.nameEn.toLowerCase().includes(q) || item.itemCode.toLowerCase().includes(q),
      );
    }
    if (lowStockOnly) {
      result = result.filter((item) => item.stockAlert === 'out' || item.stockAlert === 'low');
    }
    return result;
  }, [items, searchQuery, lowStockOnly]);

  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="flex min-h-full flex-col gap-6 bg-surface-page">
      <PageHeader
        title="Items"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setImportOpeningStockOpen(true);
              }}
            >
              Import Opening Stock
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setImportOpen(true);
              }}
            >
              Import Items
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAddItemOpen(true);
              }}
            >
              Add Item
            </Button>
          </>
        }
      />

      {/* I-1: plain div, not the shared Card primitive — Card has no className
          override and is used by 11 other screens, so restyling it here would
          have changed their look too. See PROJECT.md §2.5. */}
      <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
        <h2 className="mb-3 text-lg font-semibold text-ink">Item catalogue</h2>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <TextInput
              variant="search"
              icon={<Search size={16} strokeWidth={1.5} />}
              placeholder="Search by name or code…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
            />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => {
                setLowStockOnly(e.target.checked);
              }}
            />
            Low stock only
          </label>
        </div>
        <div className="mt-4">
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <EmptyState
                icon={<Package size={40} strokeWidth={1.5} />}
                message="No items yet"
                hint="Add your first item or import from a CSV file."
              />
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState message={`No items match "${searchQuery}".`} />
          ) : (
            <Table>
              <TableHead>
                <TableRow zebra={false} hover="neutral">
                  <TableHeaderCell className="tracking-wide text-ink-faint">Code</TableHeaderCell>
                  <TableHeaderCell className="tracking-wide text-ink-faint">Name</TableHeaderCell>
                  <TableHeaderCell className="tracking-wide text-ink-faint">
                    Business Unit
                  </TableHeaderCell>
                  <TableHeaderCell className="tracking-wide text-ink-faint">
                    Stock UoM
                  </TableHeaderCell>
                  <TableHeaderCell className="tracking-wide text-ink-faint">Stock</TableHeaderCell>
                  <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                    Retail Price
                  </TableHeaderCell>
                  <TableHeaderCell className="tracking-wide text-ink-faint">
                    Alt Unit
                  </TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <ItemsTableRow
                    key={item.id}
                    item={item}
                    lookups={lookups}
                    uomName={uomName}
                    onHistoryClick={setHistoryItem}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <AddItemModal
        open={addItemOpen}
        lookups={lookups}
        onClose={() => {
          setAddItemOpen(false);
        }}
        onCreated={(itemCode) => {
          setAddItemOpen(false);
          showToast({ variant: 'success', message: `Created ${itemCode}` });
          loadItems();
        }}
      />

      <ImportItemsModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
        onImported={loadItems}
      />

      <ImportOpeningStockModal
        open={importOpeningStockOpen}
        onClose={() => {
          setImportOpeningStockOpen(false);
        }}
        onImported={loadItems}
      />

      <ItemPriceHistoryModal
        open={historyItem !== null}
        itemId={historyItem?.id ?? null}
        itemName={historyItem?.nameEn ?? null}
        onClose={() => {
          setHistoryItem(null);
        }}
      />
    </div>
  );
}
