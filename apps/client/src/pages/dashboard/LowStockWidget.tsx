import { useEffect, useState } from 'react';
import { Card } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

export interface LowStockWidgetProps {
  /**
   * P17-2 (docs/phases/PHASE_17.md §2.2, S17-DASH-1) — switches the main
   * sidebar tab to Items. Review round 2, item 3: the caller
   * (App.tsx) also seeds the Items list's own "Low stock only" filter
   * as already ON for this one navigation (Q17-3, as approved) — this
   * component has no opinion on that; it just triggers the tab switch.
   */
  readonly onNavigateToItems: () => void;
}

/**
 * P17-2 — same shape as CashSessionWidget.tsx (own file, useState/
 * useEffect-on-mount IPC call, Card wrapper). Both counts are computed
 * server-side (item.handler.ts's runLowStockCount/runNotStockedCount,
 * using @shop/core's computeStockAlert) — never in this component,
 * since apps/client may not import @shop/core (lint-enforced).
 *
 * P17-2b (docs/phases/PHASE_17.md §9, Q17-7 ANSWERED): a second, separate
 * count — "Not stocked yet" — covers items that have never been
 * received at all (not merely "running low"), via its own IPC call so
 * the original lowStockCount contract and its tests stay untouched.
 * Hidden entirely when that count is 0.
 */
export function LowStockWidget({ onNavigateToItems }: LowStockWidgetProps): React.JSX.Element {
  const [count, setCount] = useState<number | null | undefined>(undefined);
  const [notStockedCount, setNotStockedCount] = useState<number | null>(null);

  useEffect(() => {
    ipc.item
      .lowStockCount()
      .then(setCount)
      .catch(() => {
        setCount(null);
      });
    ipc.item
      .notStockedCount()
      .then(setNotStockedCount)
      .catch(() => {
        // Never block the low-stock count over this secondary figure.
        setNotStockedCount(null);
      });
  }, []);

  return (
    <Card title="Low Stock">
      {count === undefined ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : count === null ? (
        <p className="text-sm text-ink-faint">Unable to load</p>
      ) : (
        <>
          <button
            type="button"
            onClick={onNavigateToItems}
            className="text-left text-sm text-ink-muted hover:text-ink"
          >
            <span
              className={`text-2xl font-semibold ${count > 0 ? 'text-warning' : 'text-success'}`}
            >
              {count}
            </span>{' '}
            item{count === 1 ? '' : 's'} low on stock
          </button>
          {notStockedCount !== null && notStockedCount > 0 && (
            <p className="mt-1 text-sm text-ink-faint">Not stocked yet: {notStockedCount}</p>
          )}
        </>
      )}
    </Card>
  );
}
