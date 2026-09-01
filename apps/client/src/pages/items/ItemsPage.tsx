import { useEffect, useMemo, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import {
  Alert,
  Button,
  Card,
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
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { AddItemModal } from './AddItemModal.js';
import { ImportItemsModal } from './ImportItemsModal.js';

export function ItemsPage(): React.JSX.Element {
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [items, setItems] = useState<readonly ItemDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // P4.5-3: the full list is loaded once — the search box below filters it
  // in memory, not with a new IPC call per keystroke.
  const loadItems = (): void => {
    ipc.item
      .search({ query: '', categoryId: null })
      .then(setItems)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load items');
      });
  };

  useEffect(() => {
    ipc.item
      .lookups()
      .then(setLookups)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load lookups');
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

  const businessUnitName = (id: string): string =>
    lookups?.businessUnits.find((bu) => bu.id === id)?.name ?? id;
  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-6">
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

      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <Card title="Item catalogue">
        <TextInput
          variant="search"
          placeholder="Search items by name or code"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
          }}
        />
        <div className="mt-4">
          {items.length === 0 ? (
            <EmptyState
              message="No items yet."
              hint='Click "Import Items" above, or "Add Item" to create one.'
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState message={`No items match "${searchQuery}".`} />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Code</TableHeaderCell>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Business Unit</TableHeaderCell>
                  <TableHeaderCell>Stock UoM</TableHeaderCell>
                  <TableHeaderCell className="text-right">Retail Price</TableHeaderCell>
                  <TableHeaderCell>Alt Unit</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.itemCode}</TableCell>
                    <TableCell>{item.nameEn}</TableCell>
                    <TableCell>
                      {item.businessUnitId ? businessUnitName(item.businessUnitId) : '—'}
                    </TableCell>
                    <TableCell>{uomName(item.stockUomId)}</TableCell>
                    <TableCell className="text-right">
                      {item.retailPricePaisa !== null ? (
                        <MoneyDisplay paisaValue={item.retailPricePaisa} />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{item.altUomId ? uomName(item.altUomId) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <AddItemModal
        open={addItemOpen}
        lookups={lookups}
        onClose={() => {
          setAddItemOpen(false);
        }}
        onCreated={(itemCode) => {
          setAddItemOpen(false);
          setMessage(`Created ${itemCode}`);
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
