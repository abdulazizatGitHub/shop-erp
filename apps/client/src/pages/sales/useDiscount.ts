import { useEffect, useState } from 'react';
import type { CustomerDto, DiscountConfigDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';

/**
 * Sale-level checkout discount (D-3) — owner-configured PKR/percentage
 * presets (see Settings > Discount presets), selected via dropdown rather
 * than typed. Only one preset applies per sale; picking one resets and
 * disables the other. Replaces the free-form PKR/% text-input version of
 * this hook (Session 44/C-6). Extracted out of useSaleFlow.ts to keep it
 * under the 300-line file cap (same precedent as useCart/useReceiptPrinting/
 * useLastSale).
 */
export interface Discount {
  /** false: no preset list applies to this customer — CheckoutPanel hides the whole discount section. */
  readonly applicable: boolean;
  readonly pkrEnabled: boolean;
  readonly pkrOptionsPaisa: readonly number[];
  readonly selectedPkrPaisa: number;
  readonly setSelectedPkrPaisa: (paisa: number) => void;
  readonly pctEnabled: boolean;
  readonly pctOptions: readonly number[];
  readonly selectedPct: number;
  readonly setSelectedPct: (pct: number) => void;
  readonly discountPaisa: number;
  readonly reset: () => void;
}

const EMPTY_CONFIG: DiscountConfigDto = {
  applyToWalkin: false,
  applyToWholesale: false,
  pkrEnabled: false,
  pkrPresets: [],
  pctEnabled: false,
  pctPresets: [],
};

export function useDiscount(subtotalPaisa: number, selectedCustomer: CustomerDto | null): Discount {
  const [config, setConfig] = useState<DiscountConfigDto>(EMPTY_CONFIG);
  const [selectedPkrPaisa, setSelectedPkrPaisaState] = useState(0);
  const [selectedPct, setSelectedPctState] = useState(0);

  function reset(): void {
    setSelectedPkrPaisaState(0);
    setSelectedPctState(0);
  }

  // Mutually exclusive: selecting a non-"None" PKR preset resets % to
  // "None" (and disables it, via pctEnabled-and-selectedPkrPaisa===0 in the
  // returned shape below) and vice versa.
  function setSelectedPkrPaisa(paisa: number): void {
    setSelectedPkrPaisaState(paisa);
    if (paisa > 0) {
      setSelectedPctState(0);
    }
  }
  function setSelectedPct(pct: number): void {
    setSelectedPctState(pct);
    if (pct > 0) {
      setSelectedPkrPaisaState(0);
    }
  }

  // Refetch on mount and whenever the customer (or their type) changes, per
  // D-3 — keeps the dropdowns in sync if the owner edits presets mid-shift,
  // and lets applicability be re-evaluated for the new customer type.
  useEffect(() => {
    let cancelled = false;
    ipc.setting
      .getDiscountConfig()
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        // Config unavailable — discount section stays hidden (EMPTY_CONFIG's
        // both apply flags are false), not fatal to selling.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomer?.id, selectedCustomer?.customerType]);

  // Reset selections on customer change — same rationale as the old
  // free-form hook: a discount chosen for one customer must never silently
  // carry over and overcharge/undercharge the next.
  useEffect(() => {
    reset();
  }, [selectedCustomer?.id]);

  const isWalkin = selectedCustomer === null;
  const isWholesale = selectedCustomer !== null && selectedCustomer.customerType === 'wholesale';
  const applicable = (isWalkin && config.applyToWalkin) || (isWholesale && config.applyToWholesale);

  const discountPaisa = !applicable
    ? 0
    : selectedPkrPaisa > 0
      ? selectedPkrPaisa
      : selectedPct > 0
        ? Math.round((subtotalPaisa * selectedPct) / 100)
        : 0;

  return {
    applicable,
    pkrEnabled: applicable && config.pkrEnabled,
    pkrOptionsPaisa: config.pkrPresets,
    selectedPkrPaisa,
    setSelectedPkrPaisa,
    pctEnabled: applicable && config.pctEnabled,
    pctOptions: config.pctPresets,
    selectedPct,
    setSelectedPct,
    discountPaisa,
    reset,
  };
}
