import { useEffect, useState } from 'react';
import type { CashBookRowDto } from '@shop/contracts';
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
  CartesianGrid,
  Line,
  LineChart,
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

function toCsvRows(rows: readonly CashBookRowDto[]): Record<string, string | number>[] {
  return rows.map((row) => ({
    Date: row.date,
    Description: row.description,
    'Doc No': row.docNo,
    // divide paisa by 100 for CSV export
    'In (Rs)': (row.inPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Out (Rs)': (row.outPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Balance (Rs)': (row.runningBalancePaisa / 100).toFixed(2),
  }));
}

interface KpiCardProps {
  readonly label: string;
  readonly value: React.ReactNode;
}

function KpiCard({ label, value }: KpiCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <div className="mt-1">{value}</div>
    </div>
  );
}

interface CashBookChartPoint {
  readonly label: string;
  readonly balanceRupees: number;
  readonly balancePaisa: number;
}

function toChartData(rows: readonly CashBookRowDto[]): readonly CashBookChartPoint[] {
  return rows.map((row, index) => ({
    label: row.date,
    // divide paisa by 100 for display only
    balanceRupees: row.runningBalancePaisa / 100,
    balancePaisa: row.runningBalancePaisa,
    key: `${row.docNo}-${String(index)}`,
  }));
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatMoneyTooltip(_value: unknown, _name: unknown, item: unknown): string {
  const payload = (item as { payload?: CashBookChartPoint }).payload;
  return Money.format(Money.of(payload?.balancePaisa ?? 0));
}

/**
 * R4 — DateRangeSelector (This Month default) replaces the old local
 * from/to inputs. Opening balance is derived from the first row: since
 * getCashBookReport accumulates runningBalance = prevBalance - out + in
 * (report.repository.ts), the balance BEFORE the first row is
 * firstRow.runningBalancePaisa - firstRow.inPaisa + firstRow.outPaisa.
 * Closing balance is simply the last row's runningBalancePaisa.
 */
export function CashBookReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getThisMonth(new Date()));
  const [rows, setRows] = useState<readonly CashBookRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    ipc.report
      .cashBook({ dateFrom: range.from, dateTo: range.to })
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load cash book');
      });
  }, [range]);

  const totalInPaisa = Money.sum((rows ?? []).map((r) => Money.of(r.inPaisa)));
  const totalOutPaisa = Money.sum((rows ?? []).map((r) => Money.of(r.outPaisa)));
  const firstRow = rows?.[0] ?? null;
  const lastRow = rows && rows.length > 0 ? rows[rows.length - 1] : null;
  const openingBalancePaisa = firstRow
    ? Money.add(
        Money.subtract(Money.of(firstRow.runningBalancePaisa), Money.of(firstRow.inPaisa)),
        Money.of(firstRow.outPaisa),
      )
    : 0;
  const closingBalancePaisa = lastRow ? lastRow.runningBalancePaisa : 0;
  const chartData = toChartData(rows ?? []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <DateRangeSelector value={range} onChange={setRange} />
        <ExportCsvButton
          disabled={!rows || rows.length === 0}
          onClick={() => {
            if (!rows) return;
            downloadCsv(`cash-book-${range.from}-${range.to}.csv`, toCsvRows(rows));
          }}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {!rows && !error && <LoadingState message="Loading cash book…" />}

      {rows && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              label="Opening Balance"
              value={<MoneyDisplay paisaValue={openingBalancePaisa} size="xl" />}
            />
            <KpiCard
              label="Total In"
              value={<MoneyDisplay paisaValue={totalInPaisa} size="xl" tone="in" />}
            />
            <KpiCard
              label="Total Out"
              value={<MoneyDisplay paisaValue={totalOutPaisa} size="xl" tone="out" />}
            />
            <KpiCard
              label="Closing Balance"
              value={<MoneyDisplay paisaValue={closingBalancePaisa} size="xl" />}
            />
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">Running balance</p>
            {chartData.length === 0 ? (
              <EmptyState message="No data for this period." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke={colors.line.default} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <Tooltip formatter={formatMoneyTooltip} />
                  <Line
                    type="monotone"
                    dataKey="balanceRupees"
                    name="Running Balance"
                    stroke={colors.brand.default}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">Transactions</p>
            {rows.length === 0 ? (
              <EmptyState message="No cash movements in this date range." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Date</TableHeaderCell>
                    <TableHeaderCell>Description</TableHeaderCell>
                    <TableHeaderCell>Doc No</TableHeaderCell>
                    <TableHeaderCell className="text-right">In</TableHeaderCell>
                    <TableHeaderCell className="text-right">Out</TableHeaderCell>
                    <TableHeaderCell className="text-right">Running Balance</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.docNo}-${String(index)}`}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>{row.docNo}</TableCell>
                      <TableCell className="text-right">
                        {row.inPaisa > 0 ? (
                          <MoneyDisplay paisaValue={row.inPaisa} tone="in" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.outPaisa > 0 ? (
                          <MoneyDisplay paisaValue={row.outPaisa} tone="out" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={row.runningBalancePaisa} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
