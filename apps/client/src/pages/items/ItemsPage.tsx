import { useEffect, useMemo, useState } from 'react';
import { Package, Search } from 'lucide-react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import {
  Button,
  EmptyState,
  MoneyDisplay,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
  useToast,
} from '@shop/ui';
import { BusinessUnitPill } from '../../components/shared/BusinessUnitPill.js';
import { resolveStockBadge } from '../../components/shared/StockBadge.js';
import { ipc } from '../../lib/ipc.js';
import { AddItemModal } from './AddItemModal.js';
import { ImportItemsModal } from './ImportItemsModal.js';

export function ItemsPage(): React.JSX.Element {
  const { showToast } = useToast();
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [items, setItems] = useState<readonly ItemDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) return items;
    return items.filter(
      (item) => item.nameEn.toLowerCase().includes(q) || item.itemCode.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

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
        <TextInput
          variant="search"
          icon={<Search size={16} strokeWidth={1.5} />}
          placeholder="Search by name or code…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
          }}
        />
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
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item) => {
                  const stockBadge = resolveStockBadge(item.stockOnHandMilli, item.trackStock);
                  return (
                    <TableRow key={item.id} zebra={false} hover="neutral">
                      <TableCell className="py-3">
                        <span className="inline-flex items-center rounded border border-line bg-surface-page px-2 py-0.5 font-mono text-xs text-ink-faint">
                          {item.itemCode}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">{item.nameEn}</TableCell>
                      <TableCell className="py-3">
                        <BusinessUnitPill businessUnitId={item.businessUnitId} lookups={lookups} />
                      </TableCell>
                      <TableCell className="py-3">{uomName(item.stockUomId)}</TableCell>
                      <TableCell className="py-3">
                        {stockBadge ? (
                          <span className={`text-sm font-medium ${stockBadge.className}`}>
                            {stockBadge.label}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        {item.retailPricePaisa !== null ? (
                          <MoneyDisplay paisaValue={item.retailPricePaisa} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        {item.altUomId ? uomName(item.altUomId) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
    </div>
  );
}
