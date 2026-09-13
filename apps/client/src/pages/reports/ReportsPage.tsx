import { useState } from 'react';
import { Card, PageHeader, Tabs, type TabItem } from '@shop/ui';
import { CashBookReport } from './CashBookReport.js';
import { DailySalesReport } from './DailySalesReport.js';
import { ExpensesReport } from './ExpensesReport.js';
import { JobsReport } from './JobsReport.js';
import { ReceivablesAgingReport } from './ReceivablesAgingReport.js';
import { StockValuationReport } from './StockValuationReport.js';
import { UnitPlReport } from './UnitPlReport.js';
import { WageMonthReport } from './WageMonthReport.js';

type ReportTab =
  | 'dailySales'
  | 'stockValuation'
  | 'receivables'
  | 'jobs'
  | 'cashBook'
  | 'unitPl'
  | 'wages'
  | 'expenses';

// P10-3 split into Operational/Financial groups; P10-4 added Expenses to
// Financial once its own tab (ExpensesReport.tsx) existed.
const OPERATIONAL_TABS: readonly TabItem<ReportTab>[] = [
  { key: 'dailySales', label: 'Daily Sales' },
  { key: 'stockValuation', label: 'Stock on Hand' },
  { key: 'receivables', label: 'Receivables Aging' },
  { key: 'jobs', label: 'Jobs' },
];

const FINANCIAL_TABS: readonly TabItem<ReportTab>[] = [
  { key: 'cashBook', label: 'Cash Book' },
  { key: 'unitPl', label: 'Unit P&L' },
  { key: 'wages', label: 'Wages' },
  { key: 'expenses', label: 'Expenses' },
];

const TAB_TITLES: Record<ReportTab, string> = {
  dailySales: 'Daily Sales Summary',
  stockValuation: 'Stock on Hand',
  receivables: 'Receivables Aging',
  cashBook: 'Cash Book',
  unitPl: 'Unit P&L',
  jobs: 'Jobs',
  wages: 'Wages',
  expenses: 'Expenses',
};

const GROUP_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-ink-faint';

export function ReportsPage(): React.JSX.Element {
  const [tab, setTab] = useState<ReportTab>('dailySales');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className={GROUP_LABEL_CLASS}>Operational</p>
          <Tabs items={OPERATIONAL_TABS} active={tab} onChange={setTab} />
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className={GROUP_LABEL_CLASS}>Financial</p>
          <Tabs items={FINANCIAL_TABS} active={tab} onChange={setTab} />
        </div>
      </div>

      <Card title={TAB_TITLES[tab]}>
        {tab === 'dailySales' && <DailySalesReport />}
        {tab === 'stockValuation' && <StockValuationReport />}
        {tab === 'receivables' && <ReceivablesAgingReport />}
        {tab === 'jobs' && <JobsReport />}
        {tab === 'cashBook' && <CashBookReport />}
        {tab === 'unitPl' && <UnitPlReport />}
        {tab === 'wages' && <WageMonthReport />}
        {tab === 'expenses' && <ExpensesReport />}
      </Card>
    </div>
  );
}
