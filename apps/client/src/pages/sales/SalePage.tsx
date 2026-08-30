import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateSaleInput,
  CustomerDto,
  ItemDto,
  ItemLookups,
  SaleResult,
} from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';
import { CartTable, lineTotalPaisa, mergeCartLine, type CartLine } from './CartTable.js';
import { SearchSelect } from './SearchSelect.js';

type Step = 'search-item' | 'quantity' | 'checkout' | 'warning-gate';
type PaymentMode = 'cash' | 'credit';
/** Which unit the quantity field is being entered in, for the current pendingItem. */
type SaleUnit = 'stock' | 'alt';

export function SalePage(): React.JSX.Element {
  const [step, setStep] = useState<Step>('search-item');
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [pendingItem, setPendingItem] = useState<ItemDto | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [saleUnit, setSaleUnit] = useState<SaleUnit>('stock');
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [amountPaidRupees, setAmountPaidRupees] = useState('');
  const [lastResult, setLastResult] = useState<SaleResult | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // P4-1c: kept independently of lastResult (which finishSuccess clears)
  // so the Reprint button on the confirmation message survives the cart
  // reset. printError surfaces print-after-commit's non-blocking failure
  // — the sale itself already succeeded by the time this can be set.
  const [lastCompletedSaleId, setLastCompletedSaleId] = useState<string | null>(null);
  // P4-2: captured at the same moment as lastCompletedSaleId, from the
  // CURRENT selectedCustomer — finishSuccess resets selectedCustomer to
  // null right after this, for the next sale, so the render-time check
  // can't read selectedCustomer directly by then.
  const [lastCompletedSaleIsWholesale, setLastCompletedSaleIsWholesale] = useState(false);
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

  // Step D's amount-paid prefill: total for cash, 0 for credit.
  useEffect(() => {
    if (step !== 'checkout') return;
    setAmountPaidRupees(
      paymentMode === 'cash' ? String(Money.toRupees(Money.of(cartSubtotalPaisa))) : '0',
    );
  }, [step, paymentMode, cartSubtotalPaisa]);

  // Checkout trigger — F10 from the item-search step, cart non-empty.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'F10' && step === 'search-item' && cart.length > 0) {
        event.preventDefault();
        setStep('checkout');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [step, cart.length]);

  function confirmLine(): void {
    if (!pendingItem) return;
    let quantityMilli: number;
    try {
      quantityMilli = Qty.fromUnits(qtyInput);
    } catch {
      setError('Quantity is not a valid amount');
      return;
    }
    if (quantityMilli <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }
    setError(null);
    // ADR-0013 Type 2: 'alt' only reachable when pendingItem.altUomId is
    // set (the toggle isn't rendered otherwise) — altUomId/altUomFactorMilli
    // are guaranteed non-null in that case.
    const useAltUnit = saleUnit === 'alt' && pendingItem.altUomId !== null;
    const newLine: CartLine = {
      itemId: pendingItem.id,
      itemLabel: pendingItem.nameEn,
      quantityMilli,
      unitPricePaisa: pendingItem.retailPricePaisa,
      unitLabel: useAltUnit
        ? uomName(pendingItem.altUomId as string)
        : uomName(pendingItem.stockUomId),
      saleUomId: useAltUnit ? (pendingItem.altUomId as string) : undefined,
      saleToStockFactor: useAltUnit ? (pendingItem.altUomFactorMilli as number) : undefined,
    };
    // BUG-B fix: merge into an existing line for the same item + same
    // unit rather than always appending a duplicate.
    setCart((prev) => mergeCartLine(prev, newLine));
    setPendingItem(null);
    setQtyInput('1');
    setSaleUnit('stock');
    setStep('search-item');
  }

  function removeLine(index: number): void {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function finishSuccess(result: SaleResult): void {
    const costNote = result.warnings.unitCostMissing
      ? ' (note: cost missing on at least one line — margin reporting will show a gap for it)'
      : '';
    setSuccessMessage(
      `Sale ${result.docNo} — ${Money.format(Money.of(result.totalAmountPaisa))}${costNote}`,
    );
    setLastCompletedSaleId(result.id);
    // DECISION (P4-2): Print Invoice shows only for a non-Walk-in
    // wholesale customer. Counter sales to retail customers or Walk-in
    // never show it.
    setLastCompletedSaleIsWholesale(
      selectedCustomer !== null && selectedCustomer.customerType === 'wholesale',
    );
    setCart([]);
    setSelectedCustomer(null);
    setPaymentMode('cash');
    setLastResult(null);
    setStep('search-item');
  }

  async function handleReprint(): Promise<void> {
    if (!lastCompletedSaleId) return;
    setReprinting(true);
    try {
      await ipc.print.reprintReceipt(lastCompletedSaleId);
      setPrintError(null);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Reprint failed');
    } finally {
      setReprinting(false);
    }
  }

  async function handlePrintInvoice(): Promise<void> {
    if (!lastCompletedSaleId) return;
    setInvoicePrinting(true);
    try {
      // invoice:printSaleInvoice never throws for a print failure — same
      // error isolation as the receipt — so this reads printError off
      // the result rather than relying on a catch for that case.
      const outcome = await ipc.invoice.printSaleInvoice(lastCompletedSaleId);
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
      setSuccessMessage(null);
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
      setSuccessMessage('Sale cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel sale');
    }
    setLastResult(null);
    setStep('checkout'); // keep the cart and checkout selections so the salesman can retry
  }

  return (
    <div>
      <h1>Counter sale</h1>
      {error && <p role="alert">{error}</p>}
      {successMessage && (
        <p role="status">
          {successMessage}{' '}
          {lastCompletedSaleId && (
            <button
              type="button"
              disabled={reprinting}
              onClick={() => {
                void handleReprint();
              }}
            >
              Reprint
            </button>
          )}{' '}
          {lastCompletedSaleId && lastCompletedSaleIsWholesale && (
            <button
              type="button"
              disabled={invoicePrinting}
              onClick={() => {
                void handlePrintInvoice();
              }}
            >
              Print Invoice
            </button>
          )}
        </p>
      )}
      {printError && (
        <p role="alert">
          Receipt/invoice did not print: {printError} — the sale itself is saved; use Reprint or
          Print Invoice above once the printer issue is fixed.
        </p>
      )}

      {step === 'search-item' && (
        <SearchSelect<ItemDto>
          key="item-search"
          autoFocus
          placeholder="Search item (Enter on empty = checkout)"
          search={(query) => ipc.item.search({ query, categoryId: null })}
          getKey={(item) => item.id}
          getLabel={(item) => `${item.nameEn} (${item.itemCode})`}
          onSelect={(item) => {
            setPendingItem(item);
            setQtyInput('1');
            setSaleUnit('stock');
            setStep('quantity');
          }}
          onEmptyEnter={() => {
            if (cart.length > 0) setStep('checkout');
          }}
        />
      )}

      {step === 'quantity' && pendingItem && (
        <div>
          <p>
            {pendingItem.nameEn} — quantity in{' '}
            {saleUnit === 'alt' && pendingItem.altUomId !== null
              ? uomName(pendingItem.altUomId)
              : uomName(pendingItem.stockUomId)}
            ?
          </p>
          <input
            autoFocus
            inputMode="decimal"
            value={qtyInput}
            onChange={(e) => {
              setQtyInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmLine();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setPendingItem(null);
                setStep('search-item');
              }
            }}
          />
          {pendingItem.altUomId !== null && (
            <div
              tabIndex={0}
              role="radiogroup"
              aria-label="Selling unit"
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  setSaleUnit((u) => (u === 'stock' ? 'alt' : 'stock'));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmLine();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setPendingItem(null);
                  setStep('search-item');
                }
              }}
            >
              <span role="radio" aria-checked={saleUnit === 'stock'}>
                {saleUnit === 'stock' ? '[x]' : '[ ]'} {uomName(pendingItem.stockUomId)} (Stock
                Unit)
              </span>{' '}
              <span role="radio" aria-checked={saleUnit === 'alt'}>
                {saleUnit === 'alt' ? '[x]' : '[ ]'} {uomName(pendingItem.altUomId)} (Alt Unit)
              </span>
            </div>
          )}
        </div>
      )}

      {step === 'checkout' && (
        <div>
          <h2>Checkout</h2>
          <SearchSelect<CustomerDto>
            key="customer-search"
            autoFocus
            placeholder="Customer (Enter on empty = walk-in)"
            search={(query) => ipc.customer.search({ query })}
            getKey={(customer) => customer.id}
            getLabel={(customer) =>
              customer.shopName ? `${customer.name} — ${customer.shopName}` : customer.name
            }
            onSelect={(customer) => {
              setSelectedCustomer(customer);
              paymentModeRef.current?.focus();
            }}
            onEmptyEnter={() => {
              setSelectedCustomer(null);
              paymentModeRef.current?.focus();
            }}
          />
          <p>Customer: {selectedCustomer ? selectedCustomer.name : 'Walk-in'}</p>

          <div
            ref={paymentModeRef}
            tabIndex={0}
            role="radiogroup"
            aria-label="Payment mode"
            onKeyDown={(e) => {
              if (e.key === 'c' || e.key === 'C') {
                setPaymentMode('cash');
              } else if (e.key === 'u' || e.key === 'U') {
                setPaymentMode('credit');
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                setPaymentMode((m) => (m === 'cash' ? 'credit' : 'cash'));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                amountPaidRef.current?.focus();
              }
            }}
          >
            <span role="radio" aria-checked={paymentMode === 'cash'}>
              {paymentMode === 'cash' ? '[x]' : '[ ]'} Cash (C)
            </span>{' '}
            <span role="radio" aria-checked={paymentMode === 'credit'}>
              {paymentMode === 'credit' ? '[x]' : '[ ]'} Udhaar / Credit (U)
            </span>
          </div>

          <label>
            Amount paid (Rs)
            <input
              ref={amountPaidRef}
              inputMode="decimal"
              value={amountPaidRupees}
              onChange={(e) => {
                setAmountPaidRupees(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCheckout();
                }
              }}
            />
          </label>
        </div>
      )}

      {step === 'warning-gate' && lastResult && (
        <div
          tabIndex={0}
          autoFocus
          role="alertdialog"
          aria-label="Sale warning"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              finishSuccess(lastResult);
            } else if (e.key === 'Escape') {
              void handleCancelAfterWarning(lastResult.id);
            }
          }}
        >
          <p role="alert">
            {lastResult.warnings.creditLimitExceeded && 'Credit limit exceeded for this customer. '}
            {lastResult.warnings.stockBelowZero && 'This sale takes stock below zero. '}
            Press Enter to keep this sale, or Escape to cancel it.
          </p>
        </div>
      )}

      <hr />
      <CartTable cart={cart} subtotalPaisa={cartSubtotalPaisa} onRemove={removeLine} />
      <button
        type="button"
        disabled={cart.length === 0}
        onClick={() => {
          setStep('checkout');
        }}
      >
        Checkout (F10)
      </button>
    </div>
  );
}
