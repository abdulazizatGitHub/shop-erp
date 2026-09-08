import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@shop/ui';
import { CartTable } from './CartTable.js';
import { CheckoutPanel } from './CheckoutPanel.js';
import { CustomerSearchSlot } from './CustomerSearchSlot.js';
import { HelpShortcutsModal } from './HelpShortcutsModal.js';
import { ItemSearchPanel } from './ItemSearchPanel.js';
import { SaleAlerts } from './SaleAlerts.js';
import { SaleSuccessCard } from './SaleSuccessCard.js';
import { SalesTopbar } from './SalesTopbar.js';
import { useSaleFlow } from './useSaleFlow.js';

export function SalePage(): React.JSX.Element {
  const flow = useSaleFlow();
  const [helpOpen, setHelpOpen] = useState(false);

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

      {flow.confirmedSale ? (
        <div className="flex min-h-0 flex-1 p-4">
          <SaleSuccessCard
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
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-6 p-4">
          {/* Left panel — 58%: item search, cart. Scrolls independently. */}
          <div className="flex w-3/5 flex-col gap-4 overflow-y-auto pr-1">
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
            />
          </div>

          {/* Right panel — 42%: checkout. Fixed, never scrolls. */}
          <div className="w-2/5 shrink-0">
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
              totalPaisa={flow.cartSubtotalPaisa}
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
      )}

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
    </div>
  );
}
