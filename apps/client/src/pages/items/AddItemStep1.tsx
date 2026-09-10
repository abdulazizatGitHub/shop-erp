import type { Dispatch, SetStateAction } from 'react';
import type { ItemLookups } from '@shop/contracts';
import { Button, Select, TextInput } from '@shop/ui';
import type { FormState, ItemCodeMode } from './AddItemModal.js';

export interface AddItemStep1Props {
  readonly lookups: ItemLookups | null;
  readonly form: FormState;
  readonly setForm: Dispatch<SetStateAction<FormState>>;
  readonly itemCodeMode: ItemCodeMode;
  readonly setItemCodeMode: Dispatch<SetStateAction<ItemCodeMode>>;
  readonly onCancel: () => void;
  readonly onNext: () => void;
}

/** Mechanical extraction of AddItemModal's step-1 JSX (I-0) — no logic changes. */
export function AddItemStep1({
  lookups,
  form,
  setForm,
  itemCodeMode,
  setItemCodeMode,
  onCancel,
  onNext,
}: AddItemStep1Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="Name (English)"
          autoFocus
          required
          value={form.nameEn}
          onChange={(e) => {
            setForm({ ...form, nameEn: e.target.value });
          }}
        />
        <TextInput
          label="Name (Urdu)"
          value={form.nameUr}
          onChange={(e) => {
            setForm({ ...form, nameUr: e.target.value });
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="border-t border-line" />
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Item code</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setItemCodeMode('auto');
              setForm((f) => ({ ...f, itemCode: '' }));
            }}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              itemCodeMode === 'auto'
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            Auto-generate
          </button>
          <button
            type="button"
            onClick={() => {
              setItemCodeMode('manual');
            }}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              itemCodeMode === 'manual'
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink hover:bg-surface-sunken'
            }`}
          >
            Enter manually
          </button>
        </div>
        {itemCodeMode === 'manual' && (
          <TextInput
            label="Item code"
            required
            value={form.itemCode}
            onChange={(e) => {
              setForm({ ...form, itemCode: e.target.value });
            }}
          />
        )}
      </div>

      <Select
        label="Business unit"
        required
        value={form.businessUnitId}
        onChange={(e) => {
          setForm({ ...form, businessUnitId: e.target.value });
        }}
      >
        {lookups?.businessUnits.map((bu) => (
          <option key={bu.id} value={bu.id}>
            {bu.name}
          </option>
        ))}
      </Select>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
