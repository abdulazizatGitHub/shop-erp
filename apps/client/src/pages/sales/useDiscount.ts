import { useEffect, useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';

/**
 * Sale-level checkout discount (C-6) — two mutually exclusive input forms
 * (fixed PKR or percentage), the discountPaisa this resolves to given the
 * current cart subtotal, and the wholesale-customer default pre-fill.
 * Extracted out of useSaleFlow.ts to keep it under the 300-line file cap
 * (same precedent as useCart/useReceiptPrinting/useLastSale).
 */
export interface Discount {
  readonly discountPctInput: string;
  readonly setDiscountPctInput: (value: string) => void;
  readonly discountPkrInput: string;
  readonly setDiscountPkrInput: (value: string) => void;
  readonly discountPaisa: number;
  readonly reset: () => void;
}

export function useDiscount(subtotalPaisa: number, selectedCustomer: CustomerDto | null): Discount {
  const [discountPctInput, setDiscountPctInputState] = useState('');
  const [discountPkrInput, setDiscountPkrInputState] = useState('');

  // Mutually exclusive: typing a positive value into one immediately
  // clears the other (onChange, not onBlur — C-6 spec).
  function setDiscountPctInput(value: string): void {
    setDiscountPctInputState(value);
    if (value.trim() !== '' && Number(value) > 0) {
      setDiscountPkrInputState('');
    }
  }
  function setDiscountPkrInput(value: string): void {
    setDiscountPkrInputState(value);
    if (value.trim() !== '' && Number(value) > 0) {
      setDiscountPctInputState('');
    }
  }

  function reset(): void {
    setDiscountPctInputState('');
    setDiscountPkrInputState('');
  }

  // discountPaisa computation:
  //   PKR input active -> discountPaisa = PKR value x 100
  //   % input active   -> discountPaisa = round(subtotalPaisa x pct / 100), half-up
  // Math.round rounds .5 up for the non-negative values used here, i.e. half-up.
  const pkr = Number(discountPkrInput);
  const pct = Number(discountPctInput);
  const discountPaisa =
    discountPkrInput.trim() !== '' && Number.isFinite(pkr) && pkr > 0
      ? Math.round(pkr * 100)
      : discountPctInput.trim() !== '' && Number.isFinite(pct) && pct > 0
        ? Math.round((subtotalPaisa * pct) / 100)
        : 0;

  // Wholesale customers: pre-fill whichever default discount is non-zero
  // (the two setting keys are already mutually exclusive on save — see
  // setting.repository.ts). Only removing the customer entirely clears the
  // fields — switching to a retail/staff customer must NOT wipe a discount
  // the salesman already typed in (a real bug caught in running-window
  // verification: selecting Ahmad Retail after typing a PKR 200 discount
  // silently zeroed it, which would have overcharged the customer). The
  // salesman can still override a wholesale pre-fill by typing over it.
  useEffect(() => {
    if (selectedCustomer === null) {
      reset();
      return;
    }
    if (selectedCustomer.customerType !== 'wholesale') {
      return;
    }
    let cancelled = false;
    Promise.all([
      ipc.setting.getWholesaleDefaultDiscountPct(),
      ipc.setting.getWholesaleDefaultDiscountPaisa(),
    ])
      .then(([defaultPct, defaultPaisa]) => {
        if (cancelled) return;
        if (defaultPct > 0) {
          setDiscountPctInputState(String(defaultPct));
          setDiscountPkrInputState('');
        } else if (defaultPaisa > 0) {
          setDiscountPkrInputState(String(defaultPaisa / 100));
          setDiscountPctInputState('');
        } else {
          reset();
        }
      })
      .catch(() => {
        // Defaults unavailable — salesman can still enter a discount manually.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomer?.id, selectedCustomer?.customerType]);

  return {
    discountPctInput,
    setDiscountPctInput,
    discountPkrInput,
    setDiscountPkrInput,
    discountPaisa,
    reset,
  };
}
