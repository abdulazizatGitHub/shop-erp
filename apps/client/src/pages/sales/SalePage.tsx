import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateSaleInput,
  CustomerDto,
  ItemDto,
  ItemLookups,
  SaleResult,
} from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  MoneyDisplay,
  PageHeader,
  TextInput,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { CartTable, lineTotalPaisa, mergeCartLine, type CartLine } from './CartTable.js';
import { SearchSelect } from './SearchSelect.js';

type Step = 'search-item' | 'quantity' | 'warning-gate';
type PaymentMode = 'cash' | 'credit';
/** Which unit the quantity field is being entered in, for the current pendingItem. */
type SaleUnit = 'stock' | 'alt';

interface ConfirmedSale {
  readonly id: string;
  readonly docNo: string;
  readonly totalAmountPaisa: number;
  readonly isWholesale: boolean;
  readonly costNote: string | null;
}

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
    setConfirmedSale({
      id: result.id,
      docNo: result.docNo,
      totalAmountPaisa: result.totalAmountPaisa,
      isWholesale: selectedCustomer !== null && selectedCustomer.customerType === 'wholesale',
      costNote: result.warnings.unitCostMissing
        ? 'Cost missing on at least one line — margin reporting will show a gap for it.'
        : null,
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

  // Checkout trigger — F10, whenever the cart is actionable. Re-subscribes
  // on every value handleCheckout's closure actually reads, so the listener
  // is never left holding a stale customer/payment-mode/amount-paid snapshot
  // now that the checkout panel is edited continuously rather than entered
  // as a discrete step.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.key === 'F10' &&
        cart.length > 0 &&
        step !== 'quantity' &&
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
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Counter Sale" />

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Left panel — 60%: item search, cart. Scrolls independently. */}
        <div className="flex w-3/5 flex-col gap-4 overflow-y-auto pr-1">
          {error && <Alert variant="danger">{error}</Alert>}
          {notice && (
            <Alert
              variant="success"
              onDismiss={() => {
                setNotice(null);
              }}
            >
              {notice}
            </Alert>
          )}
          {printError && (
            <Alert
              variant="warning"
              onDismiss={() => {
                setPrintError(null);
              }}
            >
              Receipt/invoice did not print: {printError} — the sale itself is saved; use Reprint or
              Print Invoice below once the printer issue is fixed.
            </Alert>
          )}

          {confirmedSale ? (
            <Card>
              <div className="flex flex-col items-start gap-2 border-l-4 border-success pl-4">
                <p className="text-sm font-medium text-ink-muted">Sale complete</p>
                <p className="text-xl font-semibold text-ink">{confirmedSale.docNo}</p>
                <MoneyDisplay paisaValue={confirmedSale.totalAmountPaisa} size="total" />
                {confirmedSale.costNote && (
                  <p className="text-xs text-warning">{confirmedSale.costNote}</p>
                )}
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    variant="secondary"
                    disabled={reprinting}
                    onClick={() => {
                      void handleReprint();
                    }}
                  >
                    Reprint
                  </Button>
                  {confirmedSale.isWholesale && (
                    <Button
                      variant="secondary"
                      disabled={invoicePrinting}
                      onClick={() => {
                        void handlePrintInvoice();
                      }}
                    >
                      Print Invoice
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => {
                      setConfirmedSale(null);
                    }}
                  >
                    New sale
                  </Button>
                </div>
              </div>
            </Card>
          ) : step === 'quantity' && pendingItem ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="mb-2 text-base text-ink">
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
                className="w-full rounded-md border border-line px-3 py-2 font-mono text-xl text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
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
                  className="mt-3 flex gap-4 text-sm text-ink"
                >
                  <span role="radio" aria-checked={saleUnit === 'stock'}>
                    {saleUnit === 'stock' ? '● ' : '○ '}
                    {uomName(pendingItem.stockUomId)} (Stock Unit)
                  </span>
                  <span role="radio" aria-checked={saleUnit === 'alt'}>
                    {saleUnit === 'alt' ? '● ' : '○ '}
                    {uomName(pendingItem.altUomId)} (Alt Unit)
                  </span>
                </div>
              )}
            </div>
          ) : (
            <SearchSelect<ItemDto>
              key="item-search"
              autoFocus
              placeholder="Search items (Enter on empty to confirm line)"
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
                if (cart.length > 0) void handleCheckout();
              }}
              renderItem={(item) => (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{item.nameEn}</p>
                    <p className="text-xs text-ink-faint">{item.itemCode}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {item.retailPricePaisa !== null ? (
                      <MoneyDisplay paisaValue={item.retailPricePaisa} size="sm" />
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                    <p className="text-xs text-ink-faint">{uomName(item.stockUomId)}</p>
                  </div>
                </div>
              )}
              renderEmpty={() => <EmptyState message="No items found" />}
            />
          )}

          <CartTable cart={cart} subtotalPaisa={cartSubtotalPaisa} onRemove={removeLine} />
        </div>

        {/* Right panel — 40%: checkout. Fixed, never scrolls. */}
        <div className="w-2/5 shrink-0">
          <Card title="Checkout">
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1 text-sm font-medium text-ink-muted">Customer</p>
                <SearchSelect<CustomerDto>
                  key="customer-search"
                  placeholder="Search customer (Enter on empty = walk-in)"
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
                <p
                  className={`mt-2 text-lg font-semibold ${
                    selectedCustomer ? 'text-ink' : 'text-ink-faint'
                  }`}
                >
                  {selectedCustomer ? selectedCustomer.name : 'Walk-in'}
                </p>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-ink-muted">Payment mode</p>
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
                  className="grid grid-cols-2 gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {/* tabIndex=-1: mouse-clickable, but the radiogroup div above
                      stays the sole keyboard-focusable stop, unchanged from before. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    role="radio"
                    aria-checked={paymentMode === 'cash'}
                    onClick={() => {
                      setPaymentMode('cash');
                    }}
                    className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
                      paymentMode === 'cash'
                        ? 'border-brand bg-brand text-white'
                        : 'border-line bg-surface text-ink hover:bg-surface-sunken'
                    }`}
                  >
                    Cash (C)
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    role="radio"
                    aria-checked={paymentMode === 'credit'}
                    onClick={() => {
                      setPaymentMode('credit');
                    }}
                    className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
                      paymentMode === 'credit'
                        ? 'border-brand bg-brand text-white'
                        : 'border-line bg-surface text-ink hover:bg-surface-sunken'
                    }`}
                  >
                    Udhaar / Credit (U)
                  </button>
                </div>
              </div>

              <TextInput
                ref={amountPaidRef}
                label="Amount paid (Rs)"
                variant="number"
                size="large"
                align="right"
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

              <Button
                variant="primary"
                size="large"
                fullWidth
                disabled={cart.length === 0 || confirmedSale !== null}
                onClick={() => {
                  void handleCheckout();
                }}
              >
                Checkout (F10)
              </Button>
            </div>
          </Card>
        </div>
      </div>

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
