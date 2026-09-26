import { useEffect, useState } from 'react';
import { Card } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

export interface LowStockWidgetProps {
  /** P17-2 (docs/phases/PHASE_17.md §2.2, S17-DASH-1) — switches the main sidebar tab to Items. No pre-filter navigation (that cross-tab wiring was deliberately removed as dead code in P15-5); the owner uses the Items list's own "Low stock only" toggle once there. */
  readonly onNavigateToItems: () => void;
}

/**
 * P17-2 — same shape as CashSessionWidget.tsx (own file, useState/
 * useEffect-on-mount IPC call, Card wrapper). The count itself is
 * computed server-side (item.handler.ts's runLowStockCount, using
 * @shop/core's isLowStock) — never in this component, since apps/client
 * may not import @shop/core (lint-enforced).
 */
export function LowStockWidget({ onNavigateToItems }: LowStockWidgetProps): React.JSX.Element {
  const [count, setCount] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    ipc.item
      .lowStockCount()
      .then(setCount)
      .catch(() => {
        setCount(null);
      });
  }, []);

  return (
    <Card title="Low Stock">
      {count === undefined ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : count === null ? (
        <p className="text-sm text-ink-faint">Unable to load</p>
      ) : (
        <button
          type="button"
          onClick={onNavigateToItems}
          className="text-left text-sm text-ink-muted hover:text-ink"
        >
          <span className={`text-2xl font-semibold ${count > 0 ? 'text-warning' : 'text-success'}`}>
            {count}
          </span>{' '}
          item{count === 1 ? '' : 's'} low on stock
        </button>
      )}
    </Card>
  );
}
