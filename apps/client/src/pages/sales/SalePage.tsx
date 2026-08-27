import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreateSaleInput, CustomerDto, ItemDto, SaleResult } from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';
import { CartTable, lineTotalPaisa, type CartLine } from './CartTable.js';
import { SearchSelect } from './SearchSelect.js';

type Step = 'search-item' | 'quantity' | 'checkout' | 'warning-gate';
type PaymentMode = 'cash' | 'credit';

export function SalePage(): React.JSX.Element {
  const [step, setStep] = useState<Step>('search-item');
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [pendingItem, setPendingItem] = useState<ItemDto | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [amountPaidRupees, setAmountPaidRupees] = useState('');
  const [lastResult, setLastResult] = useState<SaleResult | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paymentModeRef = useRef<HTMLDivElement>(null);
  const amountPaidRef = useRef<HTMLInputElement>(null);

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
    setCart((prev) => [
      ...prev,
      {
        itemId: pendingItem.id,
        itemLabel: pendingItem.nameEn,
        quantityMilli,
        unitPricePaisa: pendingItem.retailPricePaisa,
      },
    ]);
    setPendingItem(null);
    setQtyInput('1');
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
    setCart([]);
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
      lines: cart.map((line) => ({
        itemId: line.itemId,
        quantityMilli: line.quantityMilli,
        // Never the cart's retail-preview price — the server always runs
        // its own authoritative price resolution, respecting whichever
        // customer/price level was actually chosen at checkout.
        unitPricePaisa: null,
      })),
    };
    try {
      const result = await ipc.sale.create(input);
      setLastResult(result);
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
      {successMessage && <p role="status">{successMessage}</p>}

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
            setStep('quantity');
          }}
          onEmptyEnter={() => {
            if (cart.length > 0) setStep('checkout');
          }}
        />
      )}

      {step === 'quantity' && pendingItem && (
        <div>
          <p>{pendingItem.nameEn} — quantity?</p>
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
