import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateSaleInput,
  CustomerDto,
  ItemDto,
  ItemLookups,
  SaleResult,
} from '@shop/contracts';
import { Money } from '@shop/shared';
import { ConfirmDialog } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { CartTable, lineTotalPaisa, mergeCartLine, type CartLine } from './CartTable.js';
import { CheckoutPanel } from './CheckoutPanel.js';
import { CustomerSearchSlot } from './CustomerSearchSlot.js';
import { ItemSearchPanel } from './ItemSearchPanel.js';
import { SaleAlerts } from './SaleAlerts.js';
import { SaleSuccessCard, type ConfirmedSale } from './SaleSuccessCard.js';
import { SalesTopbar } from './SalesTopbar.js';

type Step = 'search-item' | 'warning-gate';
type PaymentMode = 'cash' | 'credit';
/** Which unit the quantity field was entered in, for a confirmed cart line. */
type SaleUnit = 'stock' | 'alt';

export function SalePage(): React.JSX.Element {
  const [step, setStep] = useState<Step>('search-item');
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
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
  const [reprinting, setReprinting] = useState(false);
  const [invoicePrinting, setInvoicePrinting] = useState(false);

  const paymentModeRef = useRef<HTMLDivElement>(null);
  const amountPaidRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ipc.item
      .lookups()
      .then(setLookups)
      .catch(() => {
        // Alt-unit name display degrades to raw uom ids; not fatal to selling.
      });
  }, []);

  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  const cartSubtotalPaisa = useMemo(
    () => Money.sum(cart.map((line) => Money.of(lineTotalPaisa(line) ?? 0))),
    [cart],
  );

  // P4.5-2: the checkout panel is always visible now (no more a dedicated
  // "checkout step" to enter), so this prefill runs continuously rather
  // than once on step entry — it still only ever overwrites the field in
  // response to a payment-mode switch or the subtotal changing, exactly as
  // it did before within the old checkout step.
  useEffect(() => {
    setAmountPaidRupees(
      paymentMode === 'cash' ? String(Money.toRupees(Money.of(cartSubtotalPaisa))) : '0',
    );
  }, [paymentMode, cartSubtotalPaisa]);

  function confirmLine(item: ItemDto, quantityMilli: number, saleUnit: SaleUnit): void {
    setError(null);
    // ADR-0013 Type 2: 'alt' only reachable when item.altUomId is set (the
    // toggle isn't rendered otherwise) — altUomId/altUomFactorMilli are
    // guaranteed non-null in that case.
    const useAltUnit = saleUnit === 'alt' && item.altUomId !== null;
    const newLine: CartLine = {
      itemId: item.id,
      itemLabel: item.nameEn,
      quantityMilli,
      unitPricePaisa: item.retailPricePaisa,
      unitLabel: useAltUnit ? uomName(item.altUomId as string) : uomName(item.stockUomId),
      saleUomId: useAltUnit ? (item.altUomId as string) : undefined,
      saleToStockFactor: useAltUnit ? (item.altUomFactorMilli as number) : undefined,
      businessUnitId: item.businessUnitId,
    };
    // BUG-B fix: merge into an existing line for the same item + same
    // unit rather than always appending a duplicate.
    setCart((prev) => mergeCartLine(prev, newLine));
  }

  function removeLine(index: number): void {
    setCart((prev) => prev.filter((_, i) => i !== index));
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
    setCart([]);
    setSelectedCustomer(null);
    setPaymentMode('cash');
    setLastResult(null);
    setStep('search-item');
  }

  async function handleReprint(): Promise<void> {
    if (!confirmedSale) return;
    setReprinting(true);
    try {
      await ipc.print.reprintReceipt(confirmedSale.id);
      setPrintError(null);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Reprint failed');
    } finally {
      setReprinting(false);
    }
  }

  async function handlePrintInvoice(): Promise<void> {
    if (!confirmedSale) return;
    setInvoicePrinting(true);
    try {
      // invoice:printSaleInvoice never throws for a print failure — same
      // error isolation as the receipt — so this reads printError off
      // the result rather than relying on a catch for that case.
      const outcome = await ipc.invoice.printSaleInvoice(confirmedSale.id);
      setPrintError(outcome.printError);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Print invoice failed');
    } finally {
      setInvoicePrinting(false);
    }
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
      lines: cart.map((line) => ({
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

  return (
    <div className="flex h-full flex-col bg-surface-page">
      <SalesTopbar />

      <SaleAlerts
        error={error}
        notice={notice}
        printError={printError}
        onDismissNotice={() => {
          setNotice(null);
        }}
        onDismissPrintError={() => {
          setPrintError(null);
        }}
      />

      {confirmedSale ? (
        <div className="flex min-h-0 flex-1 p-4">
          <SaleSuccessCard
            sale={confirmedSale}
            reprinting={reprinting}
            invoicePrinting={invoicePrinting}
            onReprint={() => {
              void handleReprint();
            }}
            onPrintInvoice={() => {
              void handlePrintInvoice();
            }}
            onNewSale={() => {
              setConfirmedSale(null);
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-6 p-4">
          {/* Left panel — 58%: item search, cart. Scrolls independently. */}
          <div className="flex w-3/5 flex-col gap-4 overflow-y-auto pr-1">
            <ItemSearchPanel
              lookups={lookups}
              uomName={uomName}
              onConfirmLine={confirmLine}
              onCheckoutTrigger={() => {
                if (cart.length > 0) void handleCheckout();
              }}
              onError={setError}
            />

            <CartTable
              cart={cart}
              subtotalPaisa={cartSubtotalPaisa}
              lookups={lookups}
              onRemove={removeLine}
              onClear={() => {
                setCart([]);
              }}
            />
          </div>

          {/* Right panel — 42%: checkout. Fixed, never scrolls. */}
          <div className="w-2/5 shrink-0">
            <CustomerSearchSlot
              selectedCustomer={selectedCustomer}
              onSelect={setSelectedCustomer}
              onRemove={() => {
                setSelectedCustomer(null);
                if (paymentMode === 'credit') setPaymentMode('cash');
              }}
              paymentModeRef={paymentModeRef}
            />

            <CheckoutPanel
              totalPaisa={cartSubtotalPaisa}
              paymentMode={paymentMode}
              onPaymentModeChange={setPaymentMode}
              selectedCustomer={selectedCustomer}
              amountPaidRupees={amountPaidRupees}
              onAmountPaidChange={setAmountPaidRupees}
              cartEmpty={cart.length === 0}
              onCheckout={() => {
                void handleCheckout();
              }}
              paymentModeRef={paymentModeRef}
              amountPaidRef={amountPaidRef}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={step === 'warning-gate' && lastResult !== null}
        title={warningTitle}
        confirmVariant="warning"
        confirmLabel="Continue"
        onConfirm={() => {
          if (lastResult) finishSuccess(lastResult);
        }}
        onCancel={() => {
          if (lastResult) void handleCancelAfterWarning(lastResult.id);
        }}
      >
        {warningMessages.join(' ')} Continue anyway or cancel the sale?
      </ConfirmDialog>
    </div>
  );
}
