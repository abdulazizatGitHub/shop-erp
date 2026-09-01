import { useState } from 'react';
import { Card, PageHeader, Tabs } from '@shop/ui';
import { CashBookReport } from './CashBookReport.js';
import { DailySalesReport } from './DailySalesReport.js';
import { ReceivablesAgingReport } from './ReceivablesAgingReport.js';
import { StockValuationReport } from './StockValuationReport.js';
import { UnitPlReport } from './UnitPlReport.js';

type ReportTab = 'dailySales' | 'stockValuation' | 'receivables' | 'cashBook' | 'unitPl';

const TAB_ITEMS = [
  { key: 'dailySales', label: 'Daily Sales' },
  { key: 'stockValuation', label: 'Stock on Hand' },
  { key: 'receivables', label: 'Receivables Aging' },
  { key: 'cashBook', label: 'Cash Book' },
  { key: 'unitPl', label: 'Unit P&L' },
] as const;

const TAB_TITLES: Record<ReportTab, string> = {
  dailySales: 'Daily Sales Summary',
  stockValuation: 'Stock on Hand',
  receivables: 'Receivables Aging',
  cashBook: 'Cash Book',
  unitPl: 'Unit P&L',
};

export function ReportsPage(): React.JSX.Element {
  const [tab, setTab] = useState<ReportTab>('dailySales');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" />
      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />
      <Card title={TAB_TITLES[tab]}>
        {tab === 'dailySales' && <DailySalesReport />}
        {tab === 'stockValuation' && <StockValuationReport />}
        {tab === 'receivables' && <ReceivablesAgingReport />}
        {tab === 'cashBook' && <CashBookReport />}
        {tab === 'unitPl' && <UnitPlReport />}
      </Card>
    </div>
  );
}
