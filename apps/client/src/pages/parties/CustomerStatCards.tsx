import type { CustomerBalanceDto, CustomerLedgerRowDto } from '@shop/contracts';
import { MoneyDisplay } from '@shop/ui';
import { BalanceSummary } from './BalanceSparkline.js';

export interface CustomerStatCardsProps {
  readonly balance: CustomerBalanceDto;
  readonly ledger: readonly CustomerLedgerRowDto[];
}

function openInvoiceCount(ledger: readonly CustomerLedgerRowDto[]): number {
  return ledger.filter(
    (row) =>
      row.saleStatus === 'confirmed' &&
      row.saleTotalPaisa !== null &&
      row.salePaidPaisa !== null &&
      row.saleTotalPaisa - row.salePaidPaisa > 0,
  ).length;
}

function lastActivityDate(ledger: readonly CustomerLedgerRowDto[]): string | null {
  const [first, ...rest] = ledger;
  if (!first) return null;
  return rest.reduce((max, row) => (row.entryDate > max ? row.entryDate : max), first.entryDate);
}

function StatLabel({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  );
}

/**
 * CL-5, redesigned: current balance is the dominant figure (2/4 of the
 * grid width, larger MoneyDisplay size, a coloured accent border when
 * outstanding) — "Total credit given" removed (not actionable at the
 * counter, easily confused for a balance) and replaced with a balance
 * trend sparkline computed from the already-fetched ledger rows.
 */
export function CustomerStatCards({ balance, ledger }: CustomerStatCardsProps): React.JSX.Element {
  const lastActivity = lastActivityDate(ledger);
  const owing = balance.balancePaisa > 0;

  return (
    <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
      <div className="grid grid-cols-4 divide-x divide-line">
        <div className={`col-span-2 pr-4 ${owing ? 'border-l-4 border-l-money-due pl-3' : ''}`}>
          <StatLabel>Current balance</StatLabel>
          <div className="font-medium">
            <MoneyDisplay
              paisaValue={balance.balancePaisa}
              tone={owing ? 'due' : 'positive'}
              size="xl"
            />
          </div>
          <p className="mt-1 text-caption text-ink-muted">Outstanding udhaar</p>
        </div>
        <div className="pl-4">
          <StatLabel>Open invoices</StatLabel>
          <p className="text-lg font-medium text-ink">{openInvoiceCount(ledger)}</p>
          <p className="mt-1 text-caption text-ink-muted">Unpaid invoices</p>
        </div>
        <div className="pl-4">
          <StatLabel>Last activity</StatLabel>
          <p className="font-mono text-lg font-medium text-ink">{lastActivity ?? '—'}</p>
          <p className="mt-1 text-caption text-ink-muted">Most recent entry</p>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <BalanceSummary rows={ledger} />
      </div>
    </div>
  );
}
