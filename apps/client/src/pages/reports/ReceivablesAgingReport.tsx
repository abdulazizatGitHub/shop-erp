import { useEffect, useMemo, useState } from 'react';
import type { ReceivablesAgingRowDto } from '@shop/contracts';
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
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangeSelector } from '../../components/shared/DateRangeSelector.js';
import { ExportCsvButton } from '../../components/shared/ExportCsvButton.js';
import { Pagination } from '../../components/shared/Pagination.js';
import { downloadCsv } from '../../utils/exportCsv.js';
import { ipc } from '../../lib/ipc.js';
import { getThisMonth, type DateRange } from '../../utils/dateRanges.js';
import { CustomerAgingBarChart } from './CustomerAgingBarChart.js';

const ROWS_PER_PAGE = 10;

function toCsvRows(rows: readonly ReceivablesAgingRowDto[]): Record<string, string | number>[] {
  return rows.map((row) => ({
    Customer: row.customerName,
    // divide paisa by 100 for CSV export
    'Total Owed (Rs)': (row.totalBalancePaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Current <=30d (Rs)': (row.currentPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    '31-60d (Rs)': (row.days31To60Paisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    '61-90d (Rs)': (row.days61To90Paisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    '90d+ (Rs)': (row.over90Paisa / 100).toFixed(2),
  }));
}

type ChipTone = 'plain' | 'light-warning' | 'warning' | 'danger';

const CHIP_CLASSES: Record<Exclude<ChipTone, 'plain'>, string> = {
  'light-warning': 'bg-warning/15 text-warning',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
};

/**
 * Bucket cells don't go through MoneyDisplay: the 'warning'/'danger' tones
 * need white text on a solid chip background, which MoneyDisplay's own
 * (negative-is-red-else-ink) color logic can't express. Still uses
 * Money.format — the same formatting function, just not the wrapper's
 * color choice — and keeps font-mono/tabular-nums for column alignment.
 */
function AgingAmount({
  paisaValue,
  tone,
}: {
  readonly paisaValue: number;
  readonly tone: ChipTone;
}): React.JSX.Element {
  if (paisaValue === 0) {
    return <span className="font-mono text-sm tabular-nums text-ink-faint">—</span>;
  }
  if (tone === 'plain') {
    return (
      <span className="font-mono text-sm tabular-nums text-ink">
        {Money.format(Money.of(paisaValue))}
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 font-mono text-sm tabular-nums ${CHIP_CLASSES[tone]}`}
    >
      {Money.format(Money.of(paisaValue))}
    </span>
  );
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

interface AgingBucketPoint {
  readonly bucket: string;
  readonly amountRupees: number;
  readonly amountPaisa: number;
}

function buildBuckets(rows: readonly ReceivablesAgingRowDto[]): readonly AgingBucketPoint[] {
  const currentPaisa = Money.sum(rows.map((r) => Money.of(r.currentPaisa)));
  const days31To60Paisa = Money.sum(rows.map((r) => Money.of(r.days31To60Paisa)));
  const days61To90Paisa = Money.sum(rows.map((r) => Money.of(r.days61To90Paisa)));
  const over90Paisa = Money.sum(rows.map((r) => Money.of(r.over90Paisa)));
  return [
    { bucket: 'Within 30 days', amountRupees: currentPaisa / 100, amountPaisa: currentPaisa },
    {
      bucket: '30–60 days old',
      amountRupees: days31To60Paisa / 100,
      amountPaisa: days31To60Paisa,
    },
    {
      bucket: '60–90 days old',
      amountRupees: days61To90Paisa / 100,
      amountPaisa: days61To90Paisa,
    },
    { bucket: 'Over 90 days', amountRupees: over90Paisa / 100, amountPaisa: over90Paisa },
  ];
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatMoneyTooltip(_value: unknown, _name: unknown, item: unknown): string {
  const payload = (item as { payload?: AgingBucketPoint }).payload;
  return Money.format(Money.of(payload?.amountPaisa ?? 0));
}

/**
 * R3 — DateRangeSelector's `to` date drives the aging "as of" date
 * (report:receivables now accepts an optional asOfDate, P10-4 — see
 * PROJECT.md for why the client can't re-bucket this server-side-summed
 * data itself). `from` is unused by this report (aging is a snapshot,
 * not a range), but the selector is still shown per "every tab must have
 * DateRangeSelector" — its presets just control which date the buckets
 * are computed as of.
 */
export function ReceivablesAgingReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getThisMonth(new Date()));
  const [rows, setRows] = useState<readonly ReceivablesAgingRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    ipc.report
      .receivables({ asOfDate: range.to })
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load Udhaar (Who Owes Me)');
      });
  }, [range]);

  // Only customers who actually owe something — matches the spec's
  // "Only show customers with balance > 0."
  const owing = useMemo(() => (rows ?? []).filter((row) => row.totalBalancePaisa > 0), [rows]);

  const totalPaisa = useMemo(
    () => Money.sum(owing.map((row) => Money.of(row.totalBalancePaisa))),
    [owing],
  );
  const overdue30Paisa = useMemo(
    () =>
      Money.sum(
        owing.flatMap((row) => [
          Money.of(row.days31To60Paisa),
          Money.of(row.days61To90Paisa),
          Money.of(row.over90Paisa),
        ]),
      ),
    [owing],
  );
  const chartData = useMemo(() => buildBuckets(owing), [owing]);
  const visibleOwing = owing.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!rows) return <LoadingState message="Loading Udhaar (Who Owes Me)…" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <DateRangeSelector value={range} onChange={setRange} />
          <ExportCsvButton
            disabled={owing.length === 0}
            onClick={() => {
              downloadCsv(`udhaar-${range.from}-${range.to}.csv`, toCsvRows(owing));
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Total Udhaar (Who Owes Me)"
          value={<MoneyDisplay paisaValue={totalPaisa} size="xl" />}
        />
        <KpiCard
          label="Overdue >30d"
          value={<MoneyDisplay paisaValue={overdue30Paisa} size="xl" tone="due" />}
        />
        <KpiCard
          label="Customers with balance"
          value={<span className="text-xl font-semibold text-ink">{owing.length}</span>}
        />
      </div>

      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-ink">
          Aging Breakdown — All Customers Combined
        </h2>
        {owing.length === 0 ? (
          <EmptyState message="No data for this period." />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[...chartData]}>
              <CartesianGrid stroke={colors.line.default} vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: colors.ink.muted }} />
              <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
              <Tooltip formatter={formatMoneyTooltip} />
              <Bar
                dataKey="amountRupees"
                name="Amount"
                fill={colors.warning.default}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-ink">Aging Breakdown — By Customer</h2>
        <CustomerAgingBarChart rows={owing} />
      </div>

      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-ink">Customers</h2>
        {owing.length === 0 ? (
          <EmptyState message="No customers currently owe a balance." />
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Customer</TableHeaderCell>
                  <TableHeaderCell className="text-right">Total</TableHeaderCell>
                  <TableHeaderCell className="text-right">Current (≤30d)</TableHeaderCell>
                  <TableHeaderCell className="text-right">31–60d</TableHeaderCell>
                  <TableHeaderCell className="text-right">61–90d</TableHeaderCell>
                  <TableHeaderCell className="text-right">90d+</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleOwing.map((row) => (
                  <TableRow key={row.customerId}>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell className="text-right">
                      <MoneyDisplay paisaValue={row.totalBalancePaisa} />
                    </TableCell>
                    <TableCell className="text-right">
                      <AgingAmount paisaValue={row.currentPaisa} tone="plain" />
                    </TableCell>
                    <TableCell className="text-right">
                      <AgingAmount paisaValue={row.days31To60Paisa} tone="light-warning" />
                    </TableCell>
                    <TableCell className="text-right">
                      <AgingAmount paisaValue={row.days61To90Paisa} tone="warning" />
                    </TableCell>
                    <TableCell className="text-right">
                      <AgingAmount paisaValue={row.over90Paisa} tone="danger" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              totalRows={owing.length}
              rowsPerPage={ROWS_PER_PAGE}
              currentPage={page}
              onPageChange={setPage}
            />
          </>
        )}
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-line pt-3">
          <span className="text-lg font-semibold text-ink">Total Udhaar (Who Owes Me)</span>
          <MoneyDisplay paisaValue={totalPaisa} size="xl" />
        </div>
      </div>
    </div>
  );
}
