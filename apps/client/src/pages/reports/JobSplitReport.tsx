import { useEffect, useState } from 'react';
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
import type { JobSplitRecord } from '../../types/electron-api.js';
import { DateRangeSelector } from '../../components/shared/DateRangeSelector.js';
import { ExportCsvButton } from '../../components/shared/ExportCsvButton.js';
import { Pagination } from '../../components/shared/Pagination.js';
import { downloadCsv } from '../../utils/exportCsv.js';
import { ipc } from '../../lib/ipc.js';
import { getThisMonth, type DateRange } from '../../utils/dateRanges.js';
import { PartsLabourDonut } from './PartsLabourDonut.js';

const ROWS_PER_PAGE = 10;

function toCsvRows(rows: readonly JobSplitRecord[]): Record<string, string | number>[] {
  return rows.map((r) => ({
    'Job No': r.docNo,
    Customer: r.customerName ?? 'Walk-in',
    'Received Date': r.receivedDate,
    // divide paisa by 100 for CSV export
    'Parts Margin (Rs)': (r.partsMarginPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Labour Revenue (Rs)': (r.labourChargePaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Total Billed (Rs)': (r.totalBillPaisa / 100).toFixed(2),
  }));
}

interface KpiCardProps {
  readonly label: string;
  readonly value: React.ReactNode;
}

function KpiCard({ label, value }: KpiCardProps): React.JSX.Element {
  return (
    <div className="rounded-2xl bg-surface p-6 shadow-sm">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <div className="mt-1">{value}</div>
    </div>
  );
}

interface JobChartPoint {
  readonly docNo: string;
  readonly partsMarginRupees: number;
  readonly partsMarginPaisa: number;
  readonly labourChargeRupees: number;
  readonly labourChargePaisa: number;
}

function toChartData(rows: readonly JobSplitRecord[]): readonly JobChartPoint[] {
  return rows.map((row) => ({
    docNo: row.docNo,
    // divide paisa by 100 for display only
    partsMarginRupees: row.partsMarginPaisa / 100,
    partsMarginPaisa: row.partsMarginPaisa,
    labourChargeRupees: row.labourChargePaisa / 100,
    labourChargePaisa: row.labourChargePaisa,
  }));
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatJobTooltip(_value: unknown, name: unknown, item: unknown): string {
  const payload = (item as { payload?: JobChartPoint }).payload;
  const paisa = name === 'Parts Margin' ? payload?.partsMarginPaisa : payload?.labourChargePaisa;
  return Money.format(Money.of(paisa ?? 0));
}

/**
 * job:getJobSplit only takes one jobId (see v_job_split, packages/core's
 * JobRepositoryPort) — there is no date-ranged list version. This filters
 * job:list's receivedDate client-side, then fans out one getJobSplit call
 * per job in the range. Fine for a repair shop's job volumes; flagged as
 * a known N+1 in PHASE_6.md §8 rather than adding a new read endpoint mid-session.
 * P10-4: the local dateFrom/dateTo state is now the shared DateRangeSelector
 * (This Month default) — the fan-out pattern itself is unchanged.
 */
export function JobSplitReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getThisMonth(new Date()));
  const [rows, setRows] = useState<readonly JobSplitRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setRows(null);
    setError(null);
    setPage(1);
    ipc.job
      .list({ status: null, assignedTo: null, customerId: null })
      .then(async (jobs) => {
        const inRange = jobs.filter(
          (j) => j.receivedDate >= range.from && j.receivedDate <= range.to,
        );
        const splits = await Promise.all(inRange.map((j) => ipc.job.getJobSplit(j.id)));
        setRows(splits.filter((s): s is JobSplitRecord => s !== null));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load job split report');
      });
  }, [range]);

  const partsMarginPaisa = rows ? rows.reduce((sum, r) => sum + r.partsMarginPaisa, 0) : 0;
  const labourChargePaisa = rows ? rows.reduce((sum, r) => sum + r.labourChargePaisa, 0) : 0;
  const totalBillPaisa = rows ? rows.reduce((sum, r) => sum + r.totalBillPaisa, 0) : 0;
  const chartData = toChartData(rows ?? []);
  const visibleRows = (rows ?? []).slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <DateRangeSelector value={range} onChange={setRange} />
          <ExportCsvButton
            disabled={!rows || rows.length === 0}
            onClick={() => {
              if (!rows) return;
              downloadCsv(`jobs-${range.from}-${range.to}.csv`, toCsvRows(rows));
            }}
          />
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {rows === null ? (
        <LoadingState message="Loading job split…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              label="Parts Margin"
              value={<MoneyDisplay paisaValue={partsMarginPaisa} size="xl" tone="in" />}
            />
            <KpiCard
              label="Labour Revenue"
              value={<MoneyDisplay paisaValue={labourChargePaisa} size="xl" tone="in" />}
            />
            <KpiCard
              label="Total Billed"
              value={<MoneyDisplay paisaValue={totalBillPaisa} size="xl" />}
            />
          </div>

          <div className="rounded-2xl bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-ink">Parts vs Labour</h2>
            <PartsLabourDonut
              partsMarginPaisa={partsMarginPaisa}
              labourChargePaisa={labourChargePaisa}
            />
          </div>

          <div className="rounded-2xl bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-ink">
              Parts Margin vs. Labour Revenue by Job
            </h2>
            {chartData.length === 0 ? (
              <EmptyState message="No jobs in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={[...chartData]}>
                  <CartesianGrid stroke={colors.line.default} vertical={false} />
                  <XAxis dataKey="docNo" tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
                  <Tooltip formatter={formatJobTooltip} />
                  <Legend />
                  <Bar
                    dataKey="partsMarginRupees"
                    name="Parts Margin"
                    fill={colors.brand.default}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="labourChargeRupees"
                    name="Labour Revenue"
                    fill={colors.posAccent.default}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-2xl bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-ink">Jobs</h2>
            {rows.length === 0 ? (
              <EmptyState message="No jobs received in this date range." />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Job No</TableHeaderCell>
                      <TableHeaderCell>Date</TableHeaderCell>
                      <TableHeaderCell>Customer</TableHeaderCell>
                      <TableHeaderCell>Technician</TableHeaderCell>
                      <TableHeaderCell className="text-right">Parts Margin</TableHeaderCell>
                      <TableHeaderCell className="text-right">Labour</TableHeaderCell>
                      <TableHeaderCell className="text-right">Total</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRows.map((r) => (
                      <TableRow key={r.jobId}>
                        <TableCell>{r.docNo}</TableCell>
                        <TableCell>{r.receivedDate}</TableCell>
                        <TableCell>{r.customerName ?? 'Walk-in'}</TableCell>
                        <TableCell>{r.technicianName ?? 'Unassigned'}</TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay paisaValue={r.partsMarginPaisa} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay paisaValue={r.labourChargePaisa} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay paisaValue={r.totalBillPaisa} size="sm" />
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
          </div>
        </>
      )}
    </div>
  );
}
