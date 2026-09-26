import { PageHeader } from '@shop/ui';
import { CashSessionWidget } from './CashSessionWidget.js';
import { LowStockWidget } from './LowStockWidget.js';

export interface DashboardPageProps {
  /** P17-2 — switches the main sidebar tab to Items. */
  readonly onNavigateToItems: () => void;
}

/**
 * P7-5 — this codebase had no existing home/dashboard page (PHASE_7.md's
 * GAP-7 assumed one). Owner decision: a new minimal Dashboard page/tab,
 * rather than adding the cash session widget to SalePage.tsx (the
 * app's default tab, 580 lines, the most business-critical screen).
 * Deliberately minimal — a grid of widget cards, starting with just one.
 * P17-2 (docs/phases/PHASE_17.md §2.2) adds the second: LowStockWidget.
 */
export function DashboardPage({ onNavigateToItems }: DashboardPageProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <CashSessionWidget />
        <LowStockWidget onNavigateToItems={onNavigateToItems} />
      </div>
    </div>
  );
}
