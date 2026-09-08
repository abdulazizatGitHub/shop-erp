import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@shop/ui';
import { CartTable } from './CartTable.js';
import { CheckoutPanel } from './CheckoutPanel.js';
import { CustomerSearchSlot } from './CustomerSearchSlot.js';
import { HelpShortcutsModal } from './HelpShortcutsModal.js';
import { ItemSearchPanel } from './ItemSearchPanel.js';
import { LastSaleModal } from './LastSaleModal.js';
import { SaleAlerts } from './SaleAlerts.js';
import { SaleSuccessModal } from './SaleSuccessModal.js';
import { SalesTopbar } from './SalesTopbar.js';
import { useSaleFlow } from './useSaleFlow.js';
import { useSaleQueue } from './useSaleQueue.js';

export function SalePage(): React.JSX.Element {
  const flow = useSaleFlow();
  const queue = useSaleQueue();
  const [helpOpen, setHelpOpen] = useState(false);
  const [lastSaleOpen, setLastSaleOpen] = useState(false);

  // A-4: pause the current sale-in-progress into the queue, reset the
  // screen for a new one. Silently no-ops on an empty cart (the topbar
  // button is hidden in that case, but Alt+H itself has no such guard).
  function holdCurrentSale(): void {
    if (flow.cart.length === 0) return;
    const held = queue.hold({
      cart: flow.cart,
      customer: flow.selectedCustomer,
      paymentMode: flow.paymentMode,
      amountPaidRupees: flow.amountPaidRupees,
    });
    if (!held) {
      flow.setNotice('Queue full — complete or resume a sale first');
      return;
    }
    flow.setCart([]);
    flow.setSelectedCustomer(null);
    flow.setPaymentMode('cash');
    try {
      if (!localStorage.getItem('salesQueueTooltipSeen')) {
        flow.setNotice('Held sales are temporary and will be lost if the app closes.');
        localStorage.setItem('salesQueueTooltipSeen', '1');
      }
    } catch {
      // localStorage unavailable (e.g. private mode) — skip the one-time tip, not fatal.
    }
  }

  function resumeHeldSale(id: string): void {
    const entry = queue.resume(id);
    if (!entry) return;
    flow.setCart(entry.cart);
    flow.setSelectedCustomer(entry.customer);
    flow.setPaymentMode(entry.paymentMode);
    flow.setAmountPaidRupees(entry.amountPaidRupees);
  }

  // Alt+H holds the current sale — no text-input guard needed since Alt-
  // chord shortcuts don't collide with normal typing (same convention as
  // the sidebar's Alt+\ toggle).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.altKey && (event.key === 'h' || event.key === 'H')) {
        event.preventDefault();
        holdCurrentSale();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  // "?" opens the shortcuts help modal — from anywhere on screen, guarded
  // against firing while a text input/textarea has focus, same pattern as
  // useSaleFlow's own C/U payment-mode shortcut.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== '?') return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      event.preventDefault();
      setHelpOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-surface-page">
      <SalesTopbar
        onHelpClick={() => {
          setHelpOpen(true);
        }}
        hasLastSale={flow.lastSale !== null}
        onLastSaleClick={() => {
          setLastSaleOpen(true);
        }}
        cartHasItems={flow.cart.length > 0}
        onHoldClick={holdCurrentSale}
        heldSales={queue.queue}
        onResumeHeldSale={resumeHeldSale}
      />

      <SaleAlerts
        error={flow.error}
        notice={flow.notice}
        printError={flow.printError}
        onDismissNotice={() => {
          flow.setNotice(null);
        }}
        onDismissPrintError={() => {
          flow.setPrintError(null);
        }}
      />

      <div className="flex min-h-0 flex-1 gap-3 p-4">
        {/* Left panel — 58%: item search, cart. One white card; scrolls independently. */}
        <div className="flex w-3/5 flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
          <ItemSearchPanel
            lookups={flow.lookups}
            uomName={flow.uomName}
            onConfirmLine={flow.confirmLine}
            onCheckoutTrigger={() => {
              if (flow.cart.length > 0) void flow.handleCheckout();
            }}
            onError={flow.setError}
          />

          <CartTable
            cart={flow.cart}
            subtotalPaisa={flow.cartSubtotalPaisa}
            lookups={flow.lookups}
            onRemove={flow.removeLine}
            onClear={flow.clearCart}
            onQuantityChange={flow.adjustQuantity}
            chrome="flat"
          />
        </div>

        {/* Right panel — 42%: checkout. One white card; fixed, never scrolls. */}
        <div className="flex w-2/5 shrink-0 flex-col rounded-2xl bg-surface p-4 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
          <CustomerSearchSlot
            selectedCustomer={flow.selectedCustomer}
            onSelect={flow.setSelectedCustomer}
            onRemove={() => {
              flow.setSelectedCustomer(null);
              if (flow.paymentMode === 'credit') flow.setPaymentMode('cash');
            }}
            paymentModeRef={flow.paymentModeRef}
          />

          <CheckoutPanel
            subtotalPaisa={flow.cartSubtotalPaisa}
            discountPaisa={flow.discountPaisa}
            totalPaisa={flow.totalAmountPaisa}
            discountPctInput={flow.discountPctInput}
            onDiscountPctChange={flow.setDiscountPctInput}
            discountPkrInput={flow.discountPkrInput}
            onDiscountPkrChange={flow.setDiscountPkrInput}
            paymentMode={flow.paymentMode}
            onPaymentModeChange={flow.setPaymentMode}
            selectedCustomer={flow.selectedCustomer}
            amountPaidRupees={flow.amountPaidRupees}
            onAmountPaidChange={flow.setAmountPaidRupees}
            cartEmpty={flow.cart.length === 0}
            onCheckout={() => {
              void flow.handleCheckout();
            }}
            paymentModeRef={flow.paymentModeRef}
            amountPaidRef={flow.amountPaidRef}
          />
        </div>
      </div>

      <SaleSuccessModal
        sale={flow.confirmedSale}
        reprinting={flow.reprinting}
        invoicePrinting={flow.invoicePrinting}
        onReprint={() => {
          void flow.handleReprint();
        }}
        onPrintInvoice={() => {
          void flow.handlePrintInvoice();
        }}
        onNewSale={() => {
          flow.setConfirmedSale(null);
        }}
      />

      <ConfirmDialog
        open={flow.step === 'warning-gate' && flow.lastResult !== null}
        title={flow.warningTitle}
        confirmVariant="warning"
        confirmLabel="Continue"
        onConfirm={() => {
          if (flow.lastResult) flow.finishSuccess(flow.lastResult);
        }}
        onCancel={() => {
          if (flow.lastResult) void flow.handleCancelAfterWarning(flow.lastResult.id);
        }}
      >
        {flow.warningMessages.join(' ')} Continue anyway or cancel the sale?
      </ConfirmDialog>

      <HelpShortcutsModal
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
        }}
      />

      <LastSaleModal
        sale={lastSaleOpen ? flow.lastSale : null}
        onClose={() => {
          setLastSaleOpen(false);
        }}
      />
    </div>
  );
}
