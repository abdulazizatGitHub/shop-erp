import type { RefObject } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Button, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { SearchSelect } from '../sales/SearchSelect.js';
import { PoLinesTable } from './PoLinesTable.js';
import type { PoLine } from './PoLinesTable.js';

export interface NewPoStep2Props {
  readonly lookups: ItemLookups | null;
  readonly itemSearchRef: RefObject<HTMLInputElement>;
  readonly qtyRef: RefObject<HTMLInputElement>;
  readonly pendingItem: ItemDto | null;
  readonly onSelectItem: (item: ItemDto) => void;
  readonly qtyInput: string;
  readonly onQtyInputChange: (value: string) => void;
  readonly lineNotesInput: string;
  readonly onLineNotesInputChange: (value: string) => void;
  readonly onAddLine: () => void;
  readonly onCancelPendingItem: () => void;
  readonly lines: readonly PoLine[];
  readonly onRemoveLine: (index: number) => void;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
  readonly submitting: boolean;
}

/** Step 2 of NewPoModal — line entry. Extracted to keep the modal under 300 lines. */
export function NewPoStep2({
  lookups,
  itemSearchRef,
  qtyRef,
  pendingItem,
  onSelectItem,
  qtyInput,
  onQtyInputChange,
  lineNotesInput,
  onLineNotesInputChange,
  onAddLine,
  onCancelPendingItem,
  lines,
  onRemoveLine,
  onBack,
  onSubmit,
  submitting,
}: NewPoStep2Props): React.JSX.Element {
  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  return (
    <>
      <div className="border-t border-line pt-4">
        <p className="mb-2 text-sm font-medium text-ink-muted">Add line</p>
        {!pendingItem && (
          <SearchSelect<ItemDto>
            key="item-search"
            inputRef={itemSearchRef}
            placeholder="Search item"
            search={(query) => ipc.item.search({ query, categoryId: null })}
            getKey={(item) => item.id}
            getLabel={(item) => `${item.nameEn} (${item.itemCode})`}
            onSelect={onSelectItem}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{item.nameEn}</p>
                  <p className="text-xs text-ink-faint">{item.itemCode}</p>
                </div>
                <p className="shrink-0 text-xs text-ink-faint">{uomName(item.stockUomId)}</p>
              </div>
            )}
          />
        )}
        {pendingItem && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              {pendingItem.nameEn} — quantity ({uomName(pendingItem.stockUomId)})?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <TextInput
                ref={qtyRef}
                label={`Quantity (${uomName(pendingItem.stockUomId)})`}
                autoFocus
                variant="number"
                value={qtyInput}
                onChange={(e) => {
                  onQtyInputChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAddLine();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelPendingItem();
                  }
                }}
              />
              <TextInput
                label="Line notes (optional)"
                value={lineNotesInput}
                onChange={(e) => {
                  onLineNotesInputChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAddLine();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelPendingItem();
                  }
                }}
              />
            </div>
            <div>
              <Button variant="secondary" onClick={onAddLine}>
                Add line
              </Button>
            </div>
          </div>
        )}
      </div>

      <PoLinesTable lines={lines} onRemove={onRemoveLine} />

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          size="large"
          disabled={lines.length === 0 || submitting}
          onClick={onSubmit}
        >
          Record Purchase Order
        </Button>
      </div>
    </>
  );
}
