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
import { isLowStock } from '../../components/shared/StockBadge.js';
import { ipc } from '../../lib/ipc.js';
import { AddItemModal } from './AddItemModal.js';
import { ImportItemsModal } from './ImportItemsModal.js';
import { ImportOpeningStockModal } from './ImportOpeningStockModal.js';
import { ItemPriceHistoryModal } from './ItemPriceHistoryModal.js';
import { ItemsTableRow } from './ItemsTableRow.js';

export function ItemsPage(): React.JSX.Element {
  const { showToast } = useToast();
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [items, setItems] = useState<readonly ItemDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [defaultLowStockThresholdMilli, setDefaultLowStockThresholdMilli] = useState(0);
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
    // P17-2: read-only, no toast on failure — the threshold silently
    // falls back to 0 (the safe default), same pattern as useSaleFlow.ts.
    ipc.setting
      .getDefaultLowStockThreshold()
      .then(setDefaultLowStockThresholdMilli)
      .catch(() => {
        // stays 0
      });
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = items;
    if (q.length > 0) {
      result = result.filter(
        (item) => item.nameEn.toLowerCase().includes(q) || item.itemCode.toLowerCase().includes(q),
      );
    }
    if (lowStockOnly) {
      result = result.filter((item) =>
        isLowStock(
          item.counterStockMilli,
          item.trackStock,
          item.reorderLevelMilli,
          defaultLowStockThresholdMilli,
        ),
      );
    }
    return result;
  }, [items, searchQuery, lowStockOnly, defaultLowStockThresholdMilli]);

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
                    defaultLowStockThresholdMilli={defaultLowStockThresholdMilli}
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
