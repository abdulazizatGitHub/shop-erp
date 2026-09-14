import { useEffect, useRef, useState } from 'react';
import { Card, PageHeader, Tabs, type TabItem } from '@shop/ui';
import type { ReportsGroup } from '../../app/navigation.js';
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
// P11-2 — plain-language tab labels (owner-approved terminology table).
// The ReportTab keys/IPC channel names above are untouched — only the
// display strings change.
const OPERATIONAL_TABS: readonly TabItem<ReportTab>[] = [
  { key: 'dailySales', label: 'Sales' },
  { key: 'stockValuation', label: 'Stock' },
  { key: 'receivables', label: 'Udhaar (Who Owes Me)' },
  { key: 'jobs', label: 'Jobs' },
];

const FINANCIAL_TABS: readonly TabItem<ReportTab>[] = [
  { key: 'cashBook', label: 'Cash Record' },
  { key: 'unitPl', label: 'Business Profit' },
  { key: 'wages', label: 'Wages' },
  { key: 'expenses', label: 'Expenses' },
];

const TAB_TITLES: Record<ReportTab, string> = {
  dailySales: 'Sales Summary',
  stockValuation: 'Stock',
  receivables: 'Udhaar (Who Owes Me)',
  cashBook: 'Cash Record',
  unitPl: 'Business Profit',
  jobs: 'Jobs',
  wages: 'Wages',
  expenses: 'Expenses',
};

const GROUP_LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-ink-faint';

// P11-1 — which sidebar group ("Daily Reports"/"Accounts") each tab belongs
// to, and each group's first tab (what a sidebar click jumps to).
const GROUP_FOR_TAB: Record<ReportTab, ReportsGroup> = {
  dailySales: 'daily',
  stockValuation: 'daily',
  receivables: 'daily',
  jobs: 'daily',
  cashBook: 'accounts',
  unitPl: 'accounts',
  wages: 'accounts',
  expenses: 'accounts',
};

const FIRST_TAB_FOR_GROUP: Record<ReportsGroup, ReportTab> = {
  daily: 'dailySales',
  accounts: 'cashBook',
};

export interface ReportsPageProps {
  /** Which sidebar group is current — sidebar clicks jump this tab to that group's first tab. */
  readonly activeGroup: ReportsGroup;
  /** Called when the owner clicks a tab directly (not via the sidebar) that belongs to the other group, so the sidebar's highlight stays truthful. */
  readonly onActiveGroupChange: (group: ReportsGroup) => void;
}

/**
 * P11-1 — `activeGroup`/`onActiveGroupChange` keep this page's own tab state
 * and the sidebar's group highlight in sync in both directions, without
 * clobbering a direct tab click. `lastKnownGroupRef` distinguishes an
 * externally-driven (sidebar) activeGroup change — which should jump to that
 * group's first tab — from one this component itself just reported up
 * (already reflected in the visible tab, must not reset it). See the P11-1
 * design discussion in PROGRESS.md for the two traced scenarios.
 */
export function ReportsPage({
  activeGroup,
  onActiveGroupChange,
}: ReportsPageProps): React.JSX.Element {
  const [tab, setTab] = useState<ReportTab>(() => FIRST_TAB_FOR_GROUP[activeGroup]);
  const isFirstRender = useRef(true);
  const lastKnownGroupRef = useRef<ReportsGroup>(activeGroup);

  useEffect(() => {
    if (activeGroup !== lastKnownGroupRef.current) {
      lastKnownGroupRef.current = activeGroup;
      setTab(FIRST_TAB_FOR_GROUP[activeGroup]);
    }
  }, [activeGroup]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const derivedGroup = GROUP_FOR_TAB[tab];
    if (derivedGroup !== lastKnownGroupRef.current) {
      lastKnownGroupRef.current = derivedGroup;
      onActiveGroupChange(derivedGroup);
    }
  }, [tab, onActiveGroupChange]);

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
