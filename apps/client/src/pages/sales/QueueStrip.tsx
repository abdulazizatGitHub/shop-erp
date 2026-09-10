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

function PauseIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="8" y1="5" x2="8" y2="19" />
      <line x1="16" y1="5" x2="16" y2="19" />
    </svg>
  );
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
    <div className="flex shrink-0 flex-col gap-1.5 rounded-b-2xl border-t border-line bg-surface-input px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-caption font-bold uppercase tracking-[0.06em] text-ink-faint">
          <PauseIcon />
          Held sales
        </span>
        {cartHasItems && (
          <button
            type="button"
            onClick={onHoldClick}
            title="Hold sale (Alt+H)"
            className="ml-auto shrink-0 whitespace-nowrap rounded-md border border-pos-accent-border bg-pos-accent-subtle px-2 py-0.5 text-caption font-semibold text-pos-accent hover:bg-pos-accent-subtle/70"
          >
            Alt+H Hold
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="py-1 text-center text-subheadline text-ink-faint">No held sales</p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {queue.map((entry) => (
            <li
              key={entry.id}
              className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-center"
            >
              <p className="w-full truncate text-caption font-semibold text-ink">
                {entry.customer?.name ?? 'Walk-in'}
              </p>
              <p className="whitespace-nowrap text-caption text-ink-faint">
                {entry.cart.length} {entry.cart.length === 1 ? 'item' : 'items'}
              </p>
              <MoneyDisplay paisaValue={totalPaisa(entry)} size="sm" />
              <button
                type="button"
                onClick={() => {
                  onResume(entry.id);
                }}
                className="text-caption font-semibold text-pos-accent hover:underline"
              >
                Resume →
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
