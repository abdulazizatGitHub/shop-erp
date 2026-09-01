import { useEffect, useState } from 'react';
import type { ItemLookups } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Button, Modal, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

type ItemCodeMode = 'auto' | 'manual';

interface FormState {
  itemCode: string;
  nameEn: string;
  nameUr: string;
  businessUnitId: string;
  stockUomId: string;
  retailPriceRupees: string;
  trackStock: boolean;
  // ADR-0013 Type 2 (item-specific alt-unit selling) — both blank means
  // the item sells in stock_uom only. altUomId '' = no alt unit chosen.
  altUomId: string;
  altUomFactor: string;
}

function emptyForm(lookups: ItemLookups | null): FormState {
  return {
    itemCode: '',
    nameEn: '',
    nameUr: '',
    businessUnitId: lookups?.businessUnits[0]?.id ?? '',
    stockUomId: lookups?.uoms[0]?.id ?? '',
    retailPriceRupees: '',
    trackStock: true,
    altUomId: '',
    altUomFactor: '',
  };
}

export interface AddItemModalProps {
  readonly open: boolean;
  readonly lookups: ItemLookups | null;
  readonly onClose: () => void;
  /** Called once after a successful create, with the (possibly auto-generated) item code. */
  readonly onCreated: (itemCode: string) => void;
}

/**
 * P4.5-3 improvement 1+2: two-step add-item flow (step 1 = identity,
 * step 2 = pricing/units — the exact split the old two Cards already
 * used), plus an explicit Auto-generate / Enter manually toggle for the
 * item code instead of "blank means auto".
 */
export function AddItemModal({
  open,
  lookups,
  onClose,
  onCreated,
}: AddItemModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<1 | 2>(1);
  const [itemCodeMode, setItemCodeMode] = useState<ItemCodeMode>('auto');
  const [form, setForm] = useState<FormState>(() => emptyForm(lookups));
  const [error, setError] = useState<string | null>(null);

  // Reset to a clean first step every time the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setStep(1);
      setItemCodeMode('auto');
      setForm(emptyForm(lookups));
      setError(null);
    }
    // Deliberately only [open]: `lookups` arriving later (its own async
    // load, resolved once near app start) must not reset a form the user
    // is already mid-typing in.
  }, [open]);

  if (!open) return null;

  function goNext(): void {
    setError(null);
    if (form.nameEn.trim().length === 0) {
      setError('Name (English) is required');
      return;
    }
    if (form.businessUnitId.length === 0) {
      setError('Business unit is required');
      return;
    }
    if (itemCodeMode === 'manual' && form.itemCode.trim().length === 0) {
      setError('Enter an item code, or switch to Auto-generate');
      return;
    }
    setStep(2);
  }

  function handleCreate(): void {
    setError(null);
    let retailPricePaisa: number;
    try {
      retailPricePaisa = Money.fromRupees(form.retailPriceRupees);
    } catch {
      setError('Retail price is not a valid amount');
      return;
    }

    // Mirrors CreateItemInput's Zod refinement (packages/contracts/src/item/item.ts):
    // altUomId and altUomFactor must both be given, or both left blank.
    const altUomId = form.altUomId.trim();
    const altUomFactorRaw = form.altUomFactor.trim();
    if (altUomId.length > 0 !== altUomFactorRaw.length > 0) {
      setError('Alt Selling Unit and Alt Factor must both be given, or both left blank');
      return;
    }
    let altUomFactorMilli: number | undefined;
    if (altUomId.length > 0) {
      const altUomFactorUnits = Number(altUomFactorRaw);
      if (!Number.isFinite(altUomFactorUnits) || altUomFactorUnits <= 0) {
        setError('Alt Factor is not a valid positive amount');
        return;
      }
      // The only float operation permitted (CLAUDE.md): Math.round(x * 1000).
      altUomFactorMilli = Math.round(altUomFactorUnits * 1000);
    }

    ipc.item
      .create({
        itemCode: itemCodeMode === 'manual' ? form.itemCode.trim() : null,
        nameEn: form.nameEn,
        nameUr: form.nameUr.trim().length > 0 ? form.nameUr.trim() : null,
        businessUnitId: form.businessUnitId,
        stockUomId: form.stockUomId,
        retailPricePaisa,
        trackStock: form.trackStock,
        altUomId: altUomId.length > 0 ? altUomId : undefined,
        altUomFactorMilli,
      })
      .then((result) => {
        onCreated(result.itemCode);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to create item');
      });
  }

  return (
    <Modal open={open} title={`Add item — step ${String(step)} of 2`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {step === 1 ? (
          <>
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
            <div>
              <p className="mb-1 text-sm font-medium text-ink-muted">Item code</p>
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
                <div className="mt-2">
                  <TextInput
                    label="Item code"
                    required
                    value={form.itemCode}
                    onChange={(e) => {
                      setForm({ ...form, itemCode: e.target.value });
                    }}
                  />
                </div>
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
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={goNext}>
                Next
              </Button>
            </div>
          </>
        ) : (
          <>
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
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.trackStock}
                onChange={(e) => {
                  setForm({ ...form, trackStock: e.target.checked });
                }}
              />
              Track stock
            </label>
            <div className="flex justify-between gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setStep(1);
                }}
              >
                Back
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                Create item
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
