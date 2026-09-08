import { useEffect, useRef, useState } from 'react';
import type { CreateSaleInput, CustomerDto, ItemLookups, SaleResult } from '@shop/contracts';
import { Money } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';
import type { CartLine } from './CartTable.js';
import type { LastSaleSummary } from './LastSaleModal.js';
import type { ConfirmedSale } from './SaleSuccessModal.js';
import { computeSaleWarningText } from './saleWarnings.js';
import { useCart } from './useCart.js';
import { useDiscount } from './useDiscount.js';
import { useLastSale } from './useLastSale.js';
import { usePricePreview } from './usePricePreview.js';
import { useReceiptPrinting } from './useReceiptPrinting.js';
import { useSaleKeyboardShortcuts } from './useSaleKeyboardShortcuts.js';

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
  /** Bulk cart replace — used by the A-4 sale-queue resume path in SalePage. */
  readonly setCart: (cart: readonly CartLine[]) => void;
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
  readonly discountApplicable: boolean;
  readonly discountPkrEnabled: boolean;
  readonly discountPkrOptionsPaisa: readonly number[];
  readonly selectedDiscountPkrPaisa: number;
  readonly setSelectedDiscountPkrPaisa: (paisa: number) => void;
  readonly discountPctEnabled: boolean;
  readonly discountPctOptions: readonly number[];
  readonly selectedDiscountPct: number;
  readonly setSelectedDiscountPct: (pct: number) => void;
  readonly discountPaisa: number;
  readonly totalAmountPaisa: number;
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
  readonly lastSale: LastSaleSummary | null;
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
  const { lastSale, captureLastSale } = useLastSale();
  const {
    applicable: discountApplicable,
    pkrEnabled: discountPkrEnabled,
    pkrOptionsPaisa: discountPkrOptionsPaisa,
    selectedPkrPaisa: selectedDiscountPkrPaisa,
    setSelectedPkrPaisa: setSelectedDiscountPkrPaisa,
    pctEnabled: discountPctEnabled,
    pctOptions: discountPctOptions,
    selectedPct: selectedDiscountPct,
    setSelectedPct: setSelectedDiscountPct,
    discountPaisa,
    reset: resetDiscount,
  } = useDiscount(cartFlow.cartSubtotalPaisa, selectedCustomer);
  const totalAmountPaisa = cartFlow.cartSubtotalPaisa - discountPaisa;

  const paymentModeRef = useRef<HTMLDivElement>(null);
  const amountPaidRef = useRef<HTMLInputElement>(null);

  // P4.5-2: the checkout panel is always visible now (no more a dedicated
  // "checkout step" to enter), so this prefill runs continuously rather
  // than once on step entry — it still only ever overwrites the field in
  // response to a payment-mode switch or the subtotal changing, exactly as
  // it did before within the old checkout step.
  useEffect(() => {
    // Clamp at 0: a discount temporarily exceeding the subtotal while the
    // salesman is still typing must never prefill a negative "amount
    // received" — Money.of has no non-negative guard, so an unclamped
    // negative total here would fail CreateSaleInput's paidAmountPaisa
    // check with a generic Zod error, masking the real discount-guard
    // message from packages/core (found in running-window verification).
    const clampedTotalPaisa = Math.max(0, totalAmountPaisa);
    setAmountPaidRupees(
      paymentMode === 'cash' ? String(Money.toRupees(Money.of(clampedTotalPaisa))) : '0',
    );
  }, [paymentMode, totalAmountPaisa]);

  usePricePreview(cartFlow.cart, cartFlow.setCart, selectedCustomer);

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
    captureLastSale({
      docNo: result.docNo,
      lines: cartFlow.cart,
      subtotalPaisa: cartFlow.cartSubtotalPaisa,
      totalAmountPaisa: result.totalAmountPaisa,
      customerName: selectedCustomer?.name ?? null,
      paymentMode,
      paidAmountPaisa,
    });
    cartFlow.clearCart();
    setSelectedCustomer(null);
    setPaymentMode('cash');
    resetDiscount();
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
      discountPaisa,
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

  useSaleKeyboardShortcuts({
    cart: cartFlow.cart,
    step,
    confirmedSale,
    setConfirmedSale,
    handleCheckout,
    selectedCustomer,
    paymentMode,
    amountPaidRupees,
    setPaymentMode,
  });

  const { title: warningTitle, messages: warningMessages } = computeSaleWarningText(lastResult);

  return {
    lookups: cartFlow.lookups,
    uomName: cartFlow.uomName,
    cart: cartFlow.cart,
    setCart: cartFlow.setCart,
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
    discountApplicable,
    discountPkrEnabled,
    discountPkrOptionsPaisa,
    selectedDiscountPkrPaisa,
    setSelectedDiscountPkrPaisa,
    discountPctEnabled,
    discountPctOptions,
    selectedDiscountPct,
    setSelectedDiscountPct,
    discountPaisa,
    totalAmountPaisa,
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
    lastSale,
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
