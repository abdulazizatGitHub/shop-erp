import type { SupplierDto } from '@shop/contracts';
import { Button, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { SearchSelect } from '../sales/SearchSelect.js';

export interface NewPoStep1Props {
  readonly supplier: SupplierDto | null;
  readonly onSelectSupplier: (supplier: SupplierDto) => void;
  readonly supplierNote: string;
  readonly onSupplierNoteChange: (value: string) => void;
  readonly orderDate: string;
  readonly onOrderDateChange: (value: string) => void;
  readonly expectedDelivery: string;
  readonly onExpectedDeliveryChange: (value: string) => void;
  readonly notes: string;
  readonly onNotesChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onNext: () => void;
}

/** Step 1 of NewPoModal — header details. Extracted to keep the modal under 300 lines. */
export function NewPoStep1({
  supplier,
  onSelectSupplier,
  supplierNote,
  onSupplierNoteChange,
  orderDate,
  onOrderDateChange,
  expectedDelivery,
  onExpectedDeliveryChange,
  notes,
  onNotesChange,
  onCancel,
  onNext,
}: NewPoStep1Props): React.JSX.Element {
  return (
    <>
      <div>
        <p className="mb-1 text-sm font-medium text-ink-muted">Supplier</p>
        <SearchSelect<SupplierDto>
          key="supplier-search"
          autoFocus
          placeholder="Search supplier"
          search={(query) => ipc.party.search({ query })}
          getKey={(s) => s.id}
          getLabel={(s) => (s.shopName ? `${s.name} — ${s.shopName}` : s.name)}
          onSelect={onSelectSupplier}
        />
        <p className={`mt-2 text-lg font-semibold ${supplier ? 'text-ink' : 'text-ink-faint'}`}>
          {supplier ? supplier.name : 'None selected'}
        </p>
      </div>

      {!supplier && (
        <TextInput
          label="Supplier note (no supplier selected — e.g. an unnamed/one-off supplier)"
          value={supplierNote}
          onChange={(e) => {
            onSupplierNoteChange(e.target.value);
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Order date
          <input
            type="date"
            value={orderDate}
            onChange={(e) => {
              onOrderDateChange(e.target.value);
            }}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Expected delivery (optional)
          <input
            type="date"
            value={expectedDelivery}
            onChange={(e) => {
              onExpectedDeliveryChange(e.target.value);
            }}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Notes (optional)
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            onNotesChange(e.target.value);
          }}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
        />
      </label>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onNext}>
          Next
        </Button>
      </div>
    </>
  );
}
