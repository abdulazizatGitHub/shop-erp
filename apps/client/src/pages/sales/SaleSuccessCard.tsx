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

export interface SaleSuccessCardProps {
  readonly sale: ConfirmedSale;
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
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l2.5 2.5L16 9" />
    </svg>
  );
}

/** Full-panel replacement shown after a sale completes — not a modal. Payment line and totals only; New sale (F10) resets SalePage's state, handled by the caller. */
export function SaleSuccessCard({
  sale,
  reprinting,
  invoicePrinting,
  onReprint,
  onPrintInvoice,
  onNewSale,
}: SaleSuccessCardProps): React.JSX.Element {
  const changePaisa =
    sale.paymentMode === 'cash'
      ? Money.subtract(Money.of(sale.paidAmountPaisa), Money.of(sale.totalAmountPaisa))
      : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-line bg-surface p-8 text-center">
      <div className="text-success">
        <CheckIcon />
      </div>
      <p className="text-xl font-extrabold text-ink">Sale complete</p>
      <p className="text-sm font-medium text-ink-muted">{sale.docNo}</p>
      <MoneyDisplay paisaValue={sale.totalAmountPaisa} size="total" />
      <p className="text-sm text-ink-muted">
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
        <Button variant="primary" size="large" onClick={onNewSale}>
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
  );
}
