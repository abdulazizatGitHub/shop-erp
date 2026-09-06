import { PageHeader } from '@shop/ui';
import { CashSessionWidget } from './CashSessionWidget.js';

/**
 * P7-5 — this codebase had no existing home/dashboard page (PHASE_7.md's
 * GAP-7 assumed one). Owner decision: a new minimal Dashboard page/tab,
 * rather than adding the cash session widget to SalePage.tsx (the
 * app's default tab, 580 lines, the most business-critical screen).
 * Deliberately minimal — a grid of widget cards, starting with just one.
 */
export function DashboardPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <CashSessionWidget />
      </div>
    </div>
  );
}
