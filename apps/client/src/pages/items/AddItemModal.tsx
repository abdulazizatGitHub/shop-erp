import { useEffect, useState } from 'react';
import type { ItemLookups } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Modal } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { AddItemStep1 } from './AddItemStep1.js';
import { AddItemStep2 } from './AddItemStep2.js';
import { ItemStepIndicator } from './ItemStepIndicator.js';

const STEPS = [{ label: 'Identity' }, { label: 'Pricing' }];

export type ItemCodeMode = 'auto' | 'manual';

export interface FormState {
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
 *
 * I-0 (Items redesign session): orchestrating shell only — step JSX
 * lives in AddItemStep1.tsx/AddItemStep2.tsx, extracted mechanically to
 * clear the 280-line pre-split gate. No logic changes from that split.
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
    <Modal open={open} title="Add Item" size="wide" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ItemStepIndicator currentStep={step} steps={STEPS} />
        {error && <Alert variant="danger">{error}</Alert>}

        {step === 1 ? (
          <AddItemStep1
            lookups={lookups}
            form={form}
            setForm={setForm}
            itemCodeMode={itemCodeMode}
            setItemCodeMode={setItemCodeMode}
            onCancel={onClose}
            onNext={goNext}
          />
        ) : (
          <AddItemStep2
            lookups={lookups}
            form={form}
            setForm={setForm}
            onBack={() => {
              setStep(1);
            }}
            onCreate={handleCreate}
          />
        )}
      </div>
    </Modal>
  );
}
