import { useEffect, useRef } from 'react';
import { MoneyDisplay } from '@shop/ui';
import { lineTotalPaisa } from './CartTable.js';
import type { QueuedSale } from './useSaleQueue.js';

export interface HeldSalesPopoverProps {
  readonly queue: readonly QueuedSale[];
  readonly onResume: (id: string) => void;
  readonly onClose: () => void;
}

function totalPaisa(entry: QueuedSale): number {
  return entry.cart.reduce((sum, line) => sum + (lineTotalPaisa(line) ?? 0), 0);
}

/** Floating panel listing paused sales (A-4) — anchored under the topbar's "N held" badge. */
export function HeldSalesPopover({
  queue,
  onResume,
  onClose,
}: HeldSalesPopoverProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Held sales"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border border-line bg-surface p-2 shadow-lg"
    >
      {queue.length === 0 ? (
        <p className="px-2 py-3 text-center text-sm text-ink-faint">No held sales</p>
      ) : (
        <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
          {queue.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">
                  {entry.customer?.name ?? 'Walk-in'}
                </p>
                <p className="text-[11px] text-ink-faint">
                  {entry.cart.length} {entry.cart.length === 1 ? 'item' : 'items'} ·{' '}
                  <MoneyDisplay paisaValue={totalPaisa(entry)} size="sm" />
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onResume(entry.id);
                }}
                className="shrink-0 rounded-md bg-pos-accent px-2 py-1 text-xs font-semibold text-white hover:bg-pos-accent-hover"
              >
                Resume
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
