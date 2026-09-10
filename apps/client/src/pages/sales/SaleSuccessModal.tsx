import { useEffect, useRef } from 'react';
import { Money } from '@shop/shared';
import { Button, MoneyDisplay } from '@shop/ui';

export interface ConfirmedSale {
  readonly id: string;
  readonly docNo: string;
  readonly totalAmountPaisa: number;
  readonly isWholesale: boolean;
  readonly costNote: string | null;
  readonly paymentMode: 'cash' | 'credit';
  readonly paidAmountPaisa: number;
  readonly customerName: string | null;
}

export interface SaleSuccessModalProps {
  readonly sale: ConfirmedSale | null;
  readonly reprinting: boolean;
  readonly invoicePrinting: boolean;
  readonly onReprint: () => void;
  readonly onPrintInvoice: () => void;
  readonly onNewSale: () => void;
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Modal overlay shown after a sale completes. F10 and Esc both close it
 * (F10 handled in useSaleFlow's own keydown effect, keyed off confirmedSale;
 * Esc and backdrop-click handled locally here, same split responsibility as
 * the shared Modal primitive). Closing restores the two-panel layout —
 * SalePage renders it unconditionally underneath, per the caller's own
 * onNewSale (clears confirmedSale, cart, and customer already).
 */
export function SaleSuccessModal({
  sale,
  reprinting,
  invoicePrinting,
  onReprint,
  onPrintInvoice,
  onNewSale,
}: SaleSuccessModalProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sale) panelRef.current?.focus();
  }, [sale]);

  if (!sale) return null;

  const changePaisa =
    sale.paymentMode === 'cash'
      ? Money.subtract(Money.of(sale.paidAmountPaisa), Money.of(sale.totalAmountPaisa))
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onNewSale();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Sale complete"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onNewSale();
          }
        }}
        className="flex w-full max-w-[420px] flex-col items-center gap-3 rounded-[20px] bg-surface p-9 text-center shadow-[0_20px_60px_rgba(0,0,0,.18)] outline-none"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
          <CheckIcon />
        </div>
        <p className="text-xl font-extrabold text-ink">Sale complete</p>
        <p className="text-xs text-ink-faint">{sale.docNo}</p>
        <MoneyDisplay paisaValue={sale.totalAmountPaisa} size="grand" tone="accent" />
        <p className="text-xs text-ink-faint">
          {sale.paymentMode === 'cash' ? (
            <>
              Cash — <MoneyDisplay paisaValue={sale.paidAmountPaisa} size="sm" /> received
              {changePaisa !== null && Money.compare(changePaisa, Money.ZERO) > 0 && (
                <>
                  , <MoneyDisplay paisaValue={changePaisa} size="sm" /> change
                </>
              )}
            </>
          ) : (
            <>Udhaar — posted to {sale.customerName ?? 'customer'}</>
          )}
        </p>
        {sale.costNote && <p className="text-xs text-warning">{sale.costNote}</p>}

        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button variant="posAccent" size="large" onClick={onNewSale}>
            New sale <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs">F10</kbd>
          </Button>
          <Button variant="secondary" disabled={reprinting} onClick={onReprint}>
            Print receipt
          </Button>
          {sale.isWholesale && (
            <Button variant="secondary" disabled={invoicePrinting} onClick={onPrintInvoice}>
              Print Invoice
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
