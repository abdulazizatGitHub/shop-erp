import { useEffect, useState } from 'react';
import type { WageMonthRowDto } from '@shop/contracts';
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
import { Pagination } from '../../components/shared/Pagination.js';
import { downloadCsv } from '../../utils/exportCsv.js';
import { ipc } from '../../lib/ipc.js';
import { getThisMonth, type DateRange } from '../../utils/dateRanges.js';

const ROWS_PER_PAGE = 10;

function toCsvRows(rows: readonly WageMonthRowDto[]): Record<string, string | number>[] {
  return rows.map((row) => ({
    Name: row.staffName,
    Role: row.staffRole,
    Days: row.fullDays,
    'Half Days': row.halfDays,
    Absent: row.absentDays,
    Leave: row.leaveDays,
    Holiday: row.holidayDays,
    // divide paisa by 100 for CSV export
    'Gross (Rs)': (row.grossPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Advances (Rs)': (row.advancesPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Commission (Rs)': (row.commissionPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Net Due (Rs)': (row.netPaisa / 100).toFixed(2),
  }));
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

interface WageChartPoint {
  readonly staffName: string;
  readonly grossRupees: number;
  readonly grossPaisa: number;
  readonly advancesRupees: number;
  readonly advancesPaisa: number;
  readonly netRupees: number;
  readonly netPaisa: number;
}

function toChartData(rows: readonly WageMonthRowDto[]): readonly WageChartPoint[] {
  return rows.map((row) => ({
    staffName: row.staffName,
    // divide paisa by 100 for display only
    grossRupees: row.grossPaisa / 100,
    grossPaisa: row.grossPaisa,
    advancesRupees: row.advancesPaisa / 100,
    advancesPaisa: row.advancesPaisa,
    netRupees: row.netPaisa / 100,
    netPaisa: row.netPaisa,
  }));
}

// Owner decision (P10-4): a true stacked bar can't represent
// "Advances subtracted from Gross" without either overstating the total
// (when Commission > 0) or misrepresenting a segment — grouped bars keep
// every value honest, at the cost of a stacked "waterfall" look.
// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatWageTooltip(_value: unknown, name: unknown, item: unknown): string {
  const payload = (item as { payload?: WageChartPoint }).payload;
  const paisa =
    name === 'Gross'
      ? payload?.grossPaisa
      : name === 'Advances'
        ? payload?.advancesPaisa
        : payload?.netPaisa;
  return Money.format(Money.of(paisa ?? 0));
}

/**
 * P7-11 — read-only. No export, no printing (per the brief). Every
 * money column goes through MoneyDisplay — no raw /100 division anywhere
 * outside the chart's own data-mapping step.
 * P10-4: replaced the standalone Month/Year <Select> pair with the shared
 * DateRangeSelector (This Month default) — report:wageMonth still takes
 * { year, month }, so both are derived from range.from client-side
 * (the IPC handler itself is unchanged, per instruction). A custom range
 * spanning more than one month uses only the `from` month, with a visible
 * note, since wageMonth has no multi-month concept at all.
 */
export function WageMonthReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getThisMonth(new Date()));
  const [rows, setRows] = useState<readonly WageMonthRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const year = Number.parseInt(range.from.slice(0, 4), 10);
  const month = Number.parseInt(range.from.slice(5, 7), 10);
  const spansMultipleMonths = range.from.slice(0, 7) !== range.to.slice(0, 7);

  useEffect(() => {
    setRows(null);
    setError(null);
    setPage(1);
    ipc.report
      .wageMonth({ year, month })
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load wage report');
      });
  }, [year, month]);

  const chartData = toChartData(rows ?? []);
  const visibleRows = (rows ?? []).slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <DateRangeSelector value={range} onChange={setRange} />
        <ExportCsvButton
          disabled={!rows || rows.length === 0}
          onClick={() => {
            if (!rows) return;
            downloadCsv(`wages-${range.from}-${range.to}.csv`, toCsvRows(rows));
          }}
        />
      </div>

      {/* P11-6 — always visible, not just for a multi-month custom range; reuses the same month-name lookup, still amber when the range actually spans multiple months. */}
      <p className={`text-sm ${spansMultipleMonths ? 'text-warning' : 'text-ink-muted'}`}>
        Showing wages for {MONTH_NAMES[month - 1]} {year} based on start date.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}

      {rows === null ? (
        <LoadingState message="Loading wage report…" />
      ) : (
        <>
          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">
              Gross vs. Advances vs. Net Due
            </p>
            {chartData.length === 0 ? (
              <EmptyState message="No data for this period." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[...chartData]}>
                  <CartesianGrid stroke={colors.line.default} vertical={false} />
                  <XAxis dataKey="staffName" tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <Tooltip formatter={formatWageTooltip} />
                  <Legend />
                  <Bar
                    dataKey="grossRupees"
                    name="Gross"
                    fill={colors.brand.default}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="advancesRupees"
                    name="Advances"
                    fill={colors.warning.default}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="netRupees"
                    name="Net Due"
                    fill={colors.success.default}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState message="No attendance records for this month." />
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Role</TableHeaderCell>
                    <TableHeaderCell className="text-right">Days</TableHeaderCell>
                    <TableHeaderCell className="text-right">Half-days</TableHeaderCell>
                    <TableHeaderCell className="text-right">Absent</TableHeaderCell>
                    <TableHeaderCell className="text-right">Leave</TableHeaderCell>
                    <TableHeaderCell className="text-right">Holiday</TableHeaderCell>
                    <TableHeaderCell className="text-right">Gross</TableHeaderCell>
                    <TableHeaderCell className="text-right">Advances</TableHeaderCell>
                    <TableHeaderCell className="text-right">Commission</TableHeaderCell>
                    <TableHeaderCell className="text-right">Net Due</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.staffId}>
                      <TableCell>{row.staffName}</TableCell>
                      <TableCell>{row.staffRole}</TableCell>
                      <TableCell className="text-right">{row.fullDays}</TableCell>
                      <TableCell className="text-right">{row.halfDays}</TableCell>
                      <TableCell className="text-right">{row.absentDays}</TableCell>
                      <TableCell className="text-right">{row.leaveDays}</TableCell>
                      <TableCell className="text-right">{row.holidayDays}</TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={row.grossPaisa} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={row.advancesPaisa} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={row.commissionPaisa} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={row.netPaisa} size="lg" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                totalRows={rows.length}
                rowsPerPage={ROWS_PER_PAGE}
                currentPage={page}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
