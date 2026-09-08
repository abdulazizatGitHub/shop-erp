import { useEffect, useRef } from 'react';
import { Money } from '@shop/shared';
import { MoneyDisplay, QuantityDisplay } from '@shop/ui';
import { lineTotalPaisa, type CartLine } from './CartTable.js';

export interface LastSaleSummary {
  readonly docNo: string;
  /** Client-side capture time at checkout — sale:create returns no timestamp field. */
  readonly completedAt: Date;
  readonly customerName: string | null;
  /** Snapshot of the cart at the moment of checkout, before clearCart() ran. */
  readonly lines: readonly CartLine[];
  readonly subtotalPaisa: number;
  readonly totalAmountPaisa: number;
  readonly paymentMode: 'cash' | 'credit';
  readonly paidAmountPaisa: number;
}

export interface LastSaleModalProps {
  readonly sale: LastSaleSummary | null;
  readonly onClose: () => void;
}

/** Read-only summary of the last completed sale this session. No IPC — built entirely from client-side state captured at checkout. */
export function LastSaleModal({ sale, onClose }: LastSaleModalProps): React.JSX.Element | null {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Last sale"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-ink">{sale.docNo}</p>
            <p className="text-xs text-ink-faint">
              {sale.completedAt.toLocaleString()} · {sale.customerName ?? 'Walk-in'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-m-1 rounded-md p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            ✕
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-faint">
              <th className="pb-1 font-medium">Item</th>
              <th className="pb-1 text-right font-medium">Qty</th>
              <th className="pb-1 text-right font-medium">Price</th>
              <th className="pb-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((line, index) => {
              const totalPaisa = lineTotalPaisa(line);
              return (
                <tr key={`${line.itemId}-${String(index)}`} className="border-b border-line">
                  <td className="py-1.5 pr-2 text-ink">{line.itemLabel}</td>
                  <td className="py-1.5 text-right text-ink-muted">
                    <QuantityDisplay quantityMilli={line.quantityMilli} /> {line.unitLabel}
                  </td>
                  <td className="py-1.5 text-right text-ink-muted">
                    {line.unitPricePaisa !== null ? (
                      <MoneyDisplay paisaValue={line.unitPricePaisa} size="sm" />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-1.5 text-right font-medium text-ink">
                    {totalPaisa !== null ? <MoneyDisplay paisaValue={totalPaisa} size="sm" /> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between text-ink-muted">
            <span>Subtotal</span>
            <MoneyDisplay paisaValue={sale.subtotalPaisa} size="sm" />
          </div>
          <div className="flex items-center justify-between font-semibold text-ink">
            <span>Total</span>
            <MoneyDisplay paisaValue={sale.totalAmountPaisa} size="sm" />
          </div>
          <div className="flex items-center justify-between text-ink-muted">
            <span>{sale.paymentMode === 'cash' ? 'Cash received' : 'Udhaar — amount paid'}</span>
            <MoneyDisplay paisaValue={sale.paidAmountPaisa} size="sm" />
          </div>
          {changePaisa !== null && Money.compare(changePaisa, Money.ZERO) > 0 && (
            <div className="flex items-center justify-between text-ink-muted">
              <span>Change</span>
              <MoneyDisplay paisaValue={changePaisa} size="sm" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
