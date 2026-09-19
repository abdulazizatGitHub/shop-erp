import type { CustomerLedgerRowDto } from '@shop/contracts';
import { MoneyDisplay } from '@shop/ui';

export interface BalanceSummaryProps {
  readonly rows: readonly CustomerLedgerRowDto[];
}

/**
 * Replaces the earlier balance-trend sparkline (Phase 13) with a plainer
 * "what happened lately" summary — easier to read at a glance than a chart
 * for a counter screen. Reuses the `ledger` rows CustomerDetailPage already
 * fetched — no new IPC call.
 */
export function BalanceSummary({ rows }: BalanceSummaryProps): React.JSX.Element {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recentRows = rows.filter((r) => r.entryDate >= cutoffStr);

  const creditGiven = recentRows
    .filter((r) => r.amountPaisa > 0)
    .reduce((sum, r) => sum + r.amountPaisa, 0);

  const received = recentRows
    .filter((r) => r.amountPaisa < 0)
    .reduce((sum, r) => sum + Math.abs(r.amountPaisa), 0);

  const entryCount = recentRows.length;

  if (entryCount === 0) {
    return <p className="text-xs text-ink-faint">No activity in the last 30 days</p>;
  }

  return (
    <div>
      <p className="mb-2 text-caption font-medium uppercase tracking-wide text-ink-muted">
        Last 30 days ({entryCount} {entryCount === 1 ? 'entry' : 'entries'})
      </p>
      <div className="flex gap-6">
        <div>
          <p className="mb-0.5 text-caption text-ink-muted">Credit given</p>
          <MoneyDisplay paisaValue={creditGiven} tone="out" />
        </div>
        <div>
          <p className="mb-0.5 text-caption text-ink-muted">Received</p>
          <MoneyDisplay paisaValue={received} tone="in" />
        </div>
      </div>
    </div>
  );
}
