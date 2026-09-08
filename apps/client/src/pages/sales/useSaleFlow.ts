import { useEffect, useRef, useState } from 'react';
import type { CreateSaleInput, CustomerDto, ItemLookups, SaleResult } from '@shop/contracts';
import { Money } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';
import type { CartLine } from './CartTable.js';
import type { ConfirmedSale } from './SaleSuccessCard.js';
import { useCart } from './useCart.js';
import { useReceiptPrinting } from './useReceiptPrinting.js';

type Step = 'search-item' | 'warning-gate';
export type PaymentMode = 'cash' | 'credit';

/**
 * The sale screen's own state machine — customer, payment, checkout/
 * warning-gate flow, and the keyboard shortcuts (F10, C/U) that drive it.
 * Cart-line management itself lives in useCart (this hook consumes it).
 * Extracted out of SalePage.tsx (P-UI redesign follow-up, 2026) to get
 * both files under the 300-line file cap; behavior is intentionally
 * unchanged from before the extraction — a structural move, not a rewrite.
 */
export interface SaleFlow {
  readonly lookups: ItemLookups | null;
  readonly uomName: (id: string) => string;
  readonly cart: readonly CartLine[];
  readonly cartSubtotalPaisa: number;
  readonly confirmLine: ReturnType<typeof useCart>['confirmLine'];
  readonly removeLine: (index: number) => void;
  readonly adjustQuantity: (index: number, delta: number) => void;
  readonly clearCart: () => void;
  readonly selectedCustomer: CustomerDto | null;
  readonly setSelectedCustomer: (customer: CustomerDto | null) => void;
  readonly paymentMode: PaymentMode;
  readonly setPaymentMode: (mode: PaymentMode) => void;
  readonly amountPaidRupees: string;
  readonly setAmountPaidRupees: (value: string) => void;
  readonly confirmedSale: ConfirmedSale | null;
  readonly setConfirmedSale: (sale: ConfirmedSale | null) => void;
  readonly error: string | null;
  readonly setError: (message: string | null) => void;
  readonly notice: string | null;
  readonly setNotice: (message: string | null) => void;
  readonly printError: string | null;
  readonly setPrintError: (message: string | null) => void;
  readonly reprinting: boolean;
  readonly invoicePrinting: boolean;
  readonly step: Step;
  readonly lastResult: SaleResult | null;
  readonly warningTitle: string;
  readonly warningMessages: readonly string[];
  readonly paymentModeRef: React.RefObject<HTMLDivElement>;
  readonly amountPaidRef: React.RefObject<HTMLInputElement>;
  readonly handleCheckout: () => Promise<void>;
  readonly handleReprint: () => Promise<void>;
  readonly handlePrintInvoice: () => Promise<void>;
  readonly finishSuccess: (result: SaleResult) => void;
  readonly handleCancelAfterWarning: (saleId: string) => Promise<void>;
}

export function useSaleFlow(): SaleFlow {
  const cartFlow = useCart();
  const [step, setStep] = useState<Step>('search-item');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [amountPaidRupees, setAmountPaidRupees] = useState('');
  const [lastResult, setLastResult] = useState<SaleResult | null>(null);
  // P4.5-2: the confirmation Card's data — replaces the old successMessage
  // string + lastCompletedSaleId + lastCompletedSaleIsWholesale trio. Its
  // presence is also what blocks the left panel's search/quantity slot
  // until "New sale" is clicked (per the P4.5-2 spec).
  const [confirmedSale, setConfirmedSale] = useState<ConfirmedSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const { reprinting, invoicePrinting, handleReprint, handlePrintInvoice } = useReceiptPrinting(
    confirmedSale,
    setPrintError,
  );

  const paymentModeRef = useRef<HTMLDivElement>(null);
  const amountPaidRef = useRef<HTMLInputElement>(null);

  // P4.5-2: the checkout panel is always visible now (no more a dedicated
  // "checkout step" to enter), so this prefill runs continuously rather
  // than once on step entry — it still only ever overwrites the field in
  // response to a payment-mode switch or the subtotal changing, exactly as
  // it did before within the old checkout step.
  useEffect(() => {
    setAmountPaidRupees(
      paymentMode === 'cash' ? String(Money.toRupees(Money.of(cartFlow.cartSubtotalPaisa))) : '0',
    );
  }, [paymentMode, cartFlow.cartSubtotalPaisa]);

  function confirmLine(...args: Parameters<typeof cartFlow.confirmLine>): void {
    setError(null);
    cartFlow.confirmLine(...args);
  }

  function finishSuccess(result: SaleResult): void {
    let paidAmountPaisa: number;
    try {
      paidAmountPaisa = Money.fromRupees(amountPaidRupees);
    } catch {
      paidAmountPaisa = 0;
    }
    setConfirmedSale({
      id: result.id,
      docNo: result.docNo,
      totalAmountPaisa: result.totalAmountPaisa,
      isWholesale: selectedCustomer !== null && selectedCustomer.customerType === 'wholesale',
      costNote: result.warnings.unitCostMissing
        ? 'Cost missing on at least one line — margin reporting will show a gap for it.'
        : null,
      paymentMode,
      paidAmountPaisa,
      customerName: selectedCustomer?.name ?? null,
    });
    cartFlow.clearCart();
    setSelectedCustomer(null);
    setPaymentMode('cash');
    setLastResult(null);
    setStep('search-item');
  }

  async function handleCheckout(): Promise<void> {
    setError(null);
    let paidAmountPaisa: number;
    try {
      paidAmountPaisa = Money.fromRupees(amountPaidRupees);
    } catch {
      setError('Amount paid is not a valid amount');
      return;
    }
    const input: CreateSaleInput = {
      customerId: selectedCustomer?.id ?? null,
      warehouseId: null,
      saleDate: new Date().toISOString().slice(0, 10),
      paymentMode,
      paidAmountPaisa,
      notes: null,
      lines: cartFlow.cart.map((line) => ({
        itemId: line.itemId,
        quantityMilli: line.quantityMilli,
        // Never the cart's retail-preview price — the server always runs
        // its own authoritative price resolution, respecting whichever
        // customer/price level was actually chosen at checkout.
        unitPricePaisa: null,
        saleUomId: line.saleUomId,
        saleToStockFactor: line.saleToStockFactor,
      })),
    };
    try {
      const result = await ipc.sale.create(input);
      setLastResult(result);
      setPrintError(result.printError);
      if (result.warnings.creditLimitExceeded || result.warnings.stockBelowZero) {
        setStep('warning-gate');
      } else {
        finishSuccess(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed');
    }
  }

  async function handleCancelAfterWarning(saleId: string): Promise<void> {
    try {
      await ipc.sale.cancel({ id: saleId });
      setNotice('Sale cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel sale');
    }
    setLastResult(null);
    setStep('search-item'); // keep the cart and checkout selections so the salesman can retry
  }

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
        cartFlow.cart.length > 0 &&
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
  }, [cartFlow.cart, step, confirmedSale, selectedCustomer, paymentMode, amountPaidRupees]);

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

  // BUG-Y fix: this used to be inline alertdialog text; ConfirmDialog (P4.5-0)
  // replaces it. Data gap, flagged rather than fabricated: SaleResult's
  // warnings are booleans only (stockBelowZero/creditLimitExceeded) — there
  // is no per-item name available to name in the message, so the wording
  // below is deliberately item-agnostic rather than inventing a name.
  const warningTitle =
    lastResult?.warnings.stockBelowZero === true && lastResult.warnings.creditLimitExceeded
      ? 'Stock below zero & credit limit exceeded'
      : lastResult?.warnings.stockBelowZero === true
        ? 'Stock below zero'
        : 'Credit limit exceeded';
  const warningMessages = [
    lastResult?.warnings.stockBelowZero === true &&
      'This sale will take stock below zero for one or more items. Stock will go negative.',
    lastResult?.warnings.creditLimitExceeded === true &&
      "This sale exceeds the customer's credit limit.",
  ].filter((message): message is string => typeof message === 'string');

  return {
    lookups: cartFlow.lookups,
    uomName: cartFlow.uomName,
    cart: cartFlow.cart,
    cartSubtotalPaisa: cartFlow.cartSubtotalPaisa,
    confirmLine,
    removeLine: cartFlow.removeLine,
    adjustQuantity: cartFlow.adjustQuantity,
    clearCart: cartFlow.clearCart,
    selectedCustomer,
    setSelectedCustomer,
    paymentMode,
    setPaymentMode,
    amountPaidRupees,
    setAmountPaidRupees,
    confirmedSale,
    setConfirmedSale,
    error,
    setError,
    notice,
    setNotice,
    printError,
    setPrintError,
    reprinting,
    invoicePrinting,
    step,
    lastResult,
    warningTitle,
    warningMessages,
    paymentModeRef,
    amountPaidRef,
    handleCheckout,
    handleReprint,
    handlePrintInvoice,
    finishSuccess,
    handleCancelAfterWarning,
  };
}
