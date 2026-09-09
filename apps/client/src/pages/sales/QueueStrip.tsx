import { MoneyDisplay } from '@shop/ui';
import { lineTotalPaisa } from './CartTable.js';
import type { QueuedSale } from './useSaleQueue.js';

export interface QueueStripProps {
  readonly queue: readonly QueuedSale[];
  readonly cartHasItems: boolean;
  readonly onHoldClick: () => void;
  readonly onResume: (id: string) => void;
}

function totalPaisa(entry: QueuedSale): number {
  return entry.cart.reduce((sum, line) => sum + (lineTotalPaisa(line) ?? 0), 0);
}

/**
 * E-5: held-sale queue, moved from the topbar (a floating "N held" popover)
 * to a strip fixed at the bottom of the left panel — always visible, not a
 * popover. "Hold sale" (Alt+H, unchanged shortcut) moved here too, from
 * the topbar. Replaces HeldSalesPopover.tsx.
 */
export function QueueStrip({
  queue,
  cartHasItems,
  onHoldClick,
  onResume,
}: QueueStripProps): React.JSX.Element {
  return (
    <div className="flex min-h-[56px] shrink-0 items-center gap-2 rounded-b-2xl border-t border-line bg-surface-input px-3 py-2">
      {queue.length === 0 ? (
        <p className="flex-1 text-center text-xs text-ink-faint">No held sales</p>
      ) : (
        <ul className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {queue.map((entry) => (
            <li
              key={entry.id}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="max-w-[120px] truncate text-[12px] font-semibold text-ink">
                  {entry.customer?.name ?? 'Walk-in'}
                </p>
                <p className="whitespace-nowrap text-[10px] text-ink-faint">
                  {entry.cart.length} {entry.cart.length === 1 ? 'item' : 'items'} ·{' '}
                  <MoneyDisplay paisaValue={totalPaisa(entry)} size="sm" />
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onResume(entry.id);
                }}
                className="shrink-0 rounded-md bg-pos-accent px-2 py-1 text-[11px] font-semibold text-white hover:bg-pos-accent-hover"
              >
                Resume
              </button>
            </li>
          ))}
        </ul>
      )}
      {cartHasItems && (
        <button
          type="button"
          onClick={onHoldClick}
          title="Hold sale (Alt+H)"
          className="shrink-0 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          Hold sale
        </button>
      )}
    </div>
  );
}
