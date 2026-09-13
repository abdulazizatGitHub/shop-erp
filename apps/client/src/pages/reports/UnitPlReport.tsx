import { useEffect, useState } from 'react';
import type { UnitPlReportDto, UnitPlRowDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import {
  Alert,
  EmptyState,
  LoadingState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  colors,
} from '@shop/ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DateRangeSelector } from '../../components/shared/DateRangeSelector.js';
import { ExportCsvButton } from '../../components/shared/ExportCsvButton.js';
import { downloadCsv } from '../../utils/exportCsv.js';
import { ipc } from '../../lib/ipc.js';
import { getThisMonth, type DateRange } from '../../utils/dateRanges.js';

function toCsvRows(rows: readonly UnitPlRowDto[]): Record<string, string | number>[] {
  return rows.map((row) => ({
    'Business Unit': row.unitName,
    // divide paisa by 100 for CSV export
    'Revenue (Rs)': (row.revenuePaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'COGS (Rs)': (row.cogsPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Direct Margin (Rs)': (row.directMarginPaisa / 100).toFixed(2),
    'Margin %': row.directMarginPercent.toFixed(2),
  }));
}

interface UnitPlChartPoint {
  readonly unitName: string;
  readonly revenueRupees: number;
  readonly revenuePaisa: number;
  readonly cogsRupees: number;
  readonly cogsPaisa: number;
  readonly marginRupees: number;
  readonly marginPaisa: number;
}

function toChartData(rows: readonly UnitPlRowDto[]): readonly UnitPlChartPoint[] {
  // TOTAL is excluded — the chart shows the two peer business units only.
  return rows
    .filter((row) => row.unitCode !== 'TOTAL')
    .map((row) => ({
      unitName: row.unitName,
      // divide paisa by 100 for display only
      revenueRupees: row.revenuePaisa / 100,
      revenuePaisa: row.revenuePaisa,
      cogsRupees: row.cogsPaisa / 100,
      cogsPaisa: row.cogsPaisa,
      marginRupees: row.directMarginPaisa / 100,
      marginPaisa: row.directMarginPaisa,
    }));
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatUnitPlTooltip(_value: unknown, name: unknown, item: unknown): string {
  const payload = (item as { payload?: UnitPlChartPoint }).payload;
  const paisa =
    name === 'Revenue'
      ? payload?.revenuePaisa
      : name === 'COGS'
        ? payload?.cogsPaisa
        : payload?.marginPaisa;
  return Money.format(Money.of(paisa ?? 0));
}

// P10-3: default range is This Month, per the phase brief's default rule
// (Daily Sales -> Today, every other report tab -> This Month).
export function UnitPlReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getThisMonth(new Date()));
  const [report, setReport] = useState<UnitPlReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.report
      .unitPl({ from: range.from, to: range.to })
      .then(setReport)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load unit P&L');
      });
  }, [range]);

  const chartData = report ? toChartData(report.rows) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <DateRangeSelector value={range} onChange={setRange} />
        <ExportCsvButton
          disabled={!report || report.rows.length === 0}
          onClick={() => {
            if (!report) return;
            downloadCsv(`unit-pl-${range.from}-${range.to}.csv`, toCsvRows(report.rows));
          }}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {!report ? (
        <LoadingState message="Loading unit P&L…" />
      ) : (
        <>
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">
              Revenue, COGS &amp; Direct Margin
            </p>
            {chartData.length === 0 ? (
              <EmptyState message="No data for this period." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[...chartData]}>
                  <CartesianGrid stroke={colors.line.default} vertical={false} />
                  <XAxis dataKey="unitName" tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <Tooltip formatter={formatUnitPlTooltip} />
                  <Legend />
                  <Bar
                    dataKey="revenueRupees"
                    name="Revenue"
                    fill={colors.brand.default}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="cogsRupees"
                    name="COGS"
                    fill={colors.warning.default}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="marginRupees"
                    name="Direct Margin"
                    fill={colors.success.default}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Business Unit</TableHeaderCell>
                <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  {report.rows[0]?.cogsColumnLabel ?? 'COGS'}
                </TableHeaderCell>
                <TableHeaderCell className="text-right">Direct Margin</TableHeaderCell>
                <TableHeaderCell className="text-right">Margin %</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.unitCode}>
                  <TableCell className={row.unitCode === 'TOTAL' ? 'font-semibold' : ''}>
                    {row.unitName}
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyDisplay paisaValue={row.revenuePaisa} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyDisplay paisaValue={row.cogsPaisa} />
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyDisplay paisaValue={row.directMarginPaisa} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink">
                    {row.directMarginPercent.toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-ink-faint">{report.disclaimer}</p>
        </>
      )}
    </div>
  );
}
