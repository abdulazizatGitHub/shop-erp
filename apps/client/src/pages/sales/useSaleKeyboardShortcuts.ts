import { useEffect } from 'react';
import type { CustomerDto } from '@shop/contracts';
import type { CartLine } from './CartTable.js';
import type { ConfirmedSale } from './SaleSuccessModal.js';
import type { PaymentMode } from './useSaleFlow.js';

/**
 * F10 (checkout / start-new-sale) and C/U (payment-mode) global keyboard
 * shortcuts for the sale screen. Extracted out of useSaleFlow.ts to keep it
 * under the 300-line file cap (same precedent as useCart/useReceiptPrinting/
 * useLastSale/usePricePreview); behavior is unchanged from before the
 * extraction — a structural move, not a rewrite.
 */
export function useSaleKeyboardShortcuts(params: {
  readonly cart: readonly CartLine[];
  readonly step: 'search-item' | 'warning-gate';
  readonly confirmedSale: ConfirmedSale | null;
  readonly setConfirmedSale: (sale: ConfirmedSale | null) => void;
  readonly handleCheckout: () => Promise<void>;
  readonly selectedCustomer: CustomerDto | null;
  readonly paymentMode: PaymentMode;
  readonly amountPaidRupees: string;
  readonly setPaymentMode: (mode: PaymentMode) => void;
}): void {
  const {
    cart,
    step,
    confirmedSale,
    setConfirmedSale,
    handleCheckout,
    selectedCustomer,
    paymentMode,
    amountPaidRupees,
    setPaymentMode,
  } = params;

  // Checkout trigger — F10, whenever the cart is actionable. Also handles
  // F10 on the success card (starts a new sale) — same key, different
  // meaning depending on whether confirmedSale is set. Re-subscribes on
  // every value handleCheckout's closure actually reads, so the listener
  // is never left holding a stale customer/payment-mode/amount-paid
  // snapshot now that the checkout panel is edited continuously rather
  // than entered as a discrete step.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'F10' && confirmedSale !== null) {
        event.preventDefault();
        setConfirmedSale(null);
        return;
      }
      if (
        event.key === 'F10' &&
        cart.length > 0 &&
        step !== 'warning-gate' &&
        confirmedSale === null
      ) {
        event.preventDefault();
        void handleCheckout();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [cart, step, confirmedSale, selectedCustomer, paymentMode, amountPaidRupees]);

  // C/U payment-mode shortcuts — work from anywhere on screen, except while
  // a text input/textarea has focus (so typing a customer name or a
  // quantity containing 'c'/'u' doesn't flip payment mode).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (confirmedSale !== null) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'c' || event.key === 'C') {
        setPaymentMode('cash');
      } else if ((event.key === 'u' || event.key === 'U') && selectedCustomer !== null) {
        setPaymentMode('credit');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmedSale, selectedCustomer]);
}
