import { useRef, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import {
  Button,
  MoneyDisplay,
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { SearchSelect } from '../sales/SearchSelect.js';
import { GrnLineRow } from './GrnLineRow.js';
import type { GrnLineEntry } from './grnLines.js';

export interface GrnLinesEditorProps {
  readonly lines: readonly GrnLineEntry[];
  readonly onChangeLine: (index: number, patch: Partial<GrnLineEntry>) => void;
  readonly onAddUnplannedLine: (line: GrnLineEntry) => void;
  readonly onRemoveUnplannedLine: (index: number) => void;
  readonly lookups: ItemLookups | null;
  readonly subtotalPaisa: number;
}

/** Step 2 of NewGrnModal — the editable line table + "add unplanned line". Kept separate to stay under the 300-line file cap. */
export function GrnLinesEditor({
  lines,
  onChangeLine,
  onAddUnplannedLine,
  onRemoveUnplannedLine,
  lookups,
  subtotalPaisa,
}: GrnLinesEditorProps): React.JSX.Element {
  const [addingItem, setAddingItem] = useState<ItemDto | null>(null);
  const itemSearchRef = useRef<HTMLInputElement>(null);
  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHead>
          <TableRow zebra={false} hover="neutral">
            <TableHeaderCell className="tracking-wide text-ink-faint">Item</TableHeaderCell>
            <TableHeaderCell className="text-right tracking-wide text-ink-faint">
              Ordered
            </TableHeaderCell>
            <TableHeaderCell className="text-right tracking-wide text-ink-faint">
              Already received
            </TableHeaderCell>
            <TableHeaderCell className="tracking-wide text-ink-faint">
              Receiving now
            </TableHeaderCell>
            <TableHeaderCell className="tracking-wide text-ink-faint">Unit cost</TableHeaderCell>
            <TableHeaderCell className="tracking-wide text-ink-faint">
              Selling price
            </TableHeaderCell>
            <TableHeaderCell className="tracking-wide text-ink-faint">
              Wholesale price
            </TableHeaderCell>
            <TableHeaderCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line, index) => (
            <GrnLineRow
              key={`${line.itemId}-${line.purchaseOrderLineId ?? 'unplanned'}-${String(index)}`}
              line={line}
              onChange={(patch) => {
                onChangeLine(index, patch);
              }}
              onRemove={
                line.purchaseOrderLineId === null
                  ? () => {
                      onRemoveUnplannedLine(index);
                    }
                  : undefined
              }
            />
          ))}
        </TableBody>
      </Table>

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-sm font-medium text-ink-muted">Add unplanned line</p>
        {!addingItem ? (
          <SearchSelect<ItemDto>
            key="unplanned-item-search"
            inputRef={itemSearchRef}
            placeholder="Search item not on this purchase order"
            search={(query) => ipc.item.search({ query, categoryId: null })}
            getKey={(item) => item.id}
            getLabel={(item) => `${item.nameEn} (${item.itemCode})`}
            onSelect={setAddingItem}
          />
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-ink">{addingItem.nameEn}</p>
            <Button
              variant="secondary"
              onClick={() => {
                onAddUnplannedLine({
                  purchaseOrderLineId: null,
                  itemId: addingItem.id,
                  itemLabel: addingItem.nameEn,
                  unitLabel: uomName(addingItem.stockUomId),
                  orderedMilli: 0,
                  alreadyReceivedMilli: 0,
                  receivingNowInput: '1',
                  unitCostInput: '',
                  sellingPriceInput: '',
                  wholesalePriceInput: '',
                });
                setAddingItem(null);
              }}
            >
              Add line
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setAddingItem(null);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
        <span className="text-lg font-semibold text-ink">Subtotal</span>
        <MoneyDisplay paisaValue={subtotalPaisa} size="xl" />
      </div>
    </div>
  );
}
