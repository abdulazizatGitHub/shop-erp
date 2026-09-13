import { useEffect, useState } from 'react';
import type { DailySalesReportRowDto, SaleSummaryDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import {
  Alert,
  Badge,
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
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangeSelector } from '../../components/shared/DateRangeSelector.js';
import { ExportCsvButton } from '../../components/shared/ExportCsvButton.js';
import { downloadCsv } from '../../utils/exportCsv.js';
import { ipc } from '../../lib/ipc.js';
import { getToday, type DateRange } from '../../utils/dateRanges.js';

/**
 * P10-5: SaleSummaryDto carries no line-item count — a real "Items" value
 * would need a new per-sale fetch or a backend DTO change, both out of
 * scope for a CSV-only sub-phase. Owner-confirmed: export the column with
 * an empty value per row rather than inventing a number or dropping it.
 */
function toCsvRows(
  sales: readonly SaleSummaryDto[],
  customerNames: Record<string, string>,
): Record<string, string | number>[] {
  return sales.map((sale) => ({
    Date: sale.saleDate,
    'Doc No': sale.docNo,
    Customer: sale.customerId ? (customerNames[sale.customerId] ?? '') : 'Walk-in',
    // divide paisa by 100 for CSV export
    'Cash (Rs)': (sale.paidAmountPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Credit (Rs)': ((sale.totalAmountPaisa - sale.paidAmountPaisa) / 100).toFixed(2),
    Items: '',
    // divide paisa by 100 for CSV export
    'Total (Rs)': (sale.totalAmountPaisa / 100).toFixed(2),
  }));
}

interface DailySalesChartPoint {
  readonly date: string;
  readonly totalSalesRupees: number;
  readonly totalSalesPaisa: number;
}

function toChartData(rows: readonly DailySalesReportRowDto[]): readonly DailySalesChartPoint[] {
  return rows.map((row) => ({
    date: row.date,
    // divide paisa by 100 for display only
    totalSalesRupees: row.totalSalesPaisa / 100,
    totalSalesPaisa: row.totalSalesPaisa,
  }));
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatMoneyTooltip(_value: unknown, _name: unknown, item: unknown): string {
  const payload = (item as { payload?: DailySalesChartPoint }).payload;
  return Money.format(Money.of(payload?.totalSalesPaisa ?? 0));
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

interface DailySalesTotals {
  readonly invoiceCount: number;
  readonly totalSalesPaisa: number;
  readonly cashCollectedPaisa: number;
  readonly creditGivenPaisa: number;
}

/**
 * P10-3: getDailySalesReport returns one row per date in the range, not
 * one aggregate row — summary[0] alone was only ever correct because the
 * range used to always be a single day. Now that DateRangeSelector can
 * pick a multi-day range on this tab, every returned row must be summed
 * for the KPI cards, or a multi-day selection would silently show only
 * the first day's totals while the sales table below correctly lists
 * every sale in the range.
 */
function sumDailySalesRows(rows: readonly DailySalesReportRowDto[]): DailySalesTotals {
  return rows.reduce<DailySalesTotals>(
    (acc, row) => ({
      invoiceCount: acc.invoiceCount + row.invoiceCount,
      totalSalesPaisa: Money.add(Money.of(acc.totalSalesPaisa), Money.of(row.totalSalesPaisa)),
      cashCollectedPaisa: Money.add(
        Money.of(acc.cashCollectedPaisa),
        Money.of(row.cashCollectedPaisa),
      ),
      creditGivenPaisa: Money.add(Money.of(acc.creditGivenPaisa), Money.of(row.creditGivenPaisa)),
    }),
    { invoiceCount: 0, totalSalesPaisa: 0, cashCollectedPaisa: 0, creditGivenPaisa: 0 },
  );
}

/**
 * R1 — a DateRangeSelector (default: today) drives two independent IPC
 * calls: report:dailySales (the four KPI numbers, summed across every
 * returned row) and the already-wired-but-previously-untyped
 * sale:listByDate (the per-sale table) — the repository has no single
 * function returning both, see the P4.5-6 kickoff discussion.
 */
export function DailySalesReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getToday(new Date()));
  const [summary, setSummary] = useState<readonly DailySalesReportRowDto[] | null>(null);
  const [sales, setSales] = useState<readonly SaleSummaryDto[] | null>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(null);
    setSales(null);
    setError(null);

    ipc.report
      .dailySales({ from: range.from, to: range.to })
      .then(setSummary)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load daily sales summary');
      });

    ipc.sale
      .listByDate({ dateFrom: range.from, dateTo: range.to, customerId: null, status: null })
      .then((rows) => {
        setSales(rows);
        const uniqueIds = [...new Set(rows.map((r) => r.customerId).filter((id) => id !== null))];
        uniqueIds.forEach((id) => {
          ipc.customer
            .get(id)
            .then((customer) => {
              if (customer) {
                setCustomerNames((prev) => ({ ...prev, [id]: customer.name }));
              }
            })
            .catch(() => {
              // Falls back to "Walk-in"-style id display below; not fatal to the report.
            });
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load sales for this range');
      });
  }, [range]);

  const totals = sumDailySalesRows(summary ?? []);
  const chartData = toChartData(summary ?? []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <DateRangeSelector value={range} onChange={setRange} />
        <ExportCsvButton
          disabled={!sales || sales.length === 0}
          onClick={() => {
            if (!sales) return;
            downloadCsv(
              `daily-sales-${range.from}-${range.to}.csv`,
              toCsvRows(sales, customerNames),
            );
          }}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {!summary || !sales ? (
        <LoadingState message="Loading daily sales…" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              label="Total Sales"
              value={<MoneyDisplay paisaValue={totals.totalSalesPaisa} size="xl" />}
            />
            <KpiCard
              label="Cash"
              value={<MoneyDisplay paisaValue={totals.cashCollectedPaisa} size="xl" tone="in" />}
            />
            <KpiCard
              label="Credit"
              value={<MoneyDisplay paisaValue={totals.creditGivenPaisa} size="xl" tone="due" />}
            />
            <KpiCard
              label="Transactions"
              value={
                <span className="font-mono text-xl tabular-nums text-ink">
                  {totals.invoiceCount}
                </span>
              }
            />
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">Sales by day</p>
            {chartData.length === 0 ? (
              <EmptyState message="No data for this period." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid stroke={colors.line.default} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <Tooltip formatter={formatMoneyTooltip} />
                  <Bar
                    dataKey="totalSalesRupees"
                    name="Total Sales"
                    fill={colors.money.in}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">Sales in this range</p>
            {sales.length === 0 ? (
              <EmptyState message="No sales recorded in this range." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Doc No</TableHeaderCell>
                    <TableHeaderCell>Customer</TableHeaderCell>
                    <TableHeaderCell>Payment</TableHeaderCell>
                    <TableHeaderCell className="text-right">Total</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{sale.docNo}</TableCell>
                      <TableCell>
                        {sale.customerId ? (customerNames[sale.customerId] ?? '…') : 'Walk-in'}
                      </TableCell>
                      <TableCell>
                        <Badge tone={sale.paymentMode === 'cash' ? 'success' : 'warning'}>
                          {sale.paymentMode === 'cash' ? 'Cash' : 'Credit'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={sale.totalAmountPaisa} />
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
