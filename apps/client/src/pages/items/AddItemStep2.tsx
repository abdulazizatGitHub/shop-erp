import type { Dispatch, SetStateAction } from 'react';
import type { ItemLookups } from '@shop/contracts';
import { Button, Select, TextInput } from '@shop/ui';
import type { FormState } from './AddItemModal.js';

export interface AddItemStep2Props {
  readonly lookups: ItemLookups | null;
  readonly form: FormState;
  readonly setForm: Dispatch<SetStateAction<FormState>>;
  readonly onBack: () => void;
  readonly onCreate: () => void;
}

/** Mechanical extraction of AddItemModal's step-2 JSX (I-0) — no logic changes. */
export function AddItemStep2({
  lookups,
  form,
  setForm,
  onBack,
  onCreate,
}: AddItemStep2Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Stock UoM"
          required
          value={form.stockUomId}
          onChange={(e) => {
            setForm({ ...form, stockUomId: e.target.value });
          }}
        >
          {lookups?.uoms.map((uom) => (
            <option key={uom.id} value={uom.id}>
              {uom.name}
            </option>
          ))}
        </Select>
        <TextInput
          label="Retail price (Rs)"
          required
          variant="number"
          value={form.retailPriceRupees}
          onChange={(e) => {
            setForm({ ...form, retailPriceRupees: e.target.value });
          }}
        />
      </div>

      <Select
        label="Alt selling unit (optional)"
        value={form.altUomId}
        onChange={(e) => {
          setForm({ ...form, altUomId: e.target.value, altUomFactor: '' });
        }}
      >
        <option value="">None — sells in stock unit only</option>
        {lookups?.uoms.map((uom) => (
          <option key={uom.id} value={uom.id}>
            {uom.name}
          </option>
        ))}
      </Select>
      {form.altUomId.length > 0 && (
        <TextInput
          label="Alt Factor (units per 1 alt unit)"
          required
          variant="number"
          value={form.altUomFactor}
          onChange={(e) => {
            setForm({ ...form, altUomFactor: e.target.value });
          }}
        />
      )}

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line bg-surface-page px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink">Track stock inventory</span>
          <span className="text-xs text-ink-faint">
            When enabled, sales will deduct from stock on hand.
          </span>
        </div>

        {/* CSS-only toggle switch — the real checkbox is hidden */}
        <div className="relative ml-4 shrink-0">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={form.trackStock}
            onChange={(e) => {
              setForm({ ...form, trackStock: e.target.checked });
            }}
            id="track-stock-toggle"
          />
          <div className="h-6 w-11 rounded-full bg-line transition-colors duration-200 peer-checked:bg-brand" />
          <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-5" />
        </div>
      </label>

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onCreate}>
          Create item
        </Button>
      </div>
    </div>
  );
}
