import { useEffect, useState } from 'react';
import type { ExpenseDto, ExpenseSummaryRowDto } from '@shop/contracts';
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
  Cell,
  Legend,
  Pie,
  PieChart,
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

// Cycled through for pie slices — no hardcoded hex, all from the shared
// token file. More categories than colors just repeats the cycle.
const PIE_COLORS = [
  colors.brand.default,
  colors.posAccent.default,
  colors.warning.default,
  colors.success.default,
  colors.danger.default,
  colors.money.due,
];

const METHOD_LABELS: Record<ExpenseDto['method'], string> = {
  cash: 'Cash',
  owner_personal: 'Owner Personal',
};

function toCsvRows(expenses: readonly ExpenseDto[]): Record<string, string | number>[] {
  return expenses.map((expense) => ({
    Date: expense.expenseDate,
    Category: expense.categoryName,
    'Business Unit': expense.businessUnitCode,
    // divide paisa by 100 for CSV export
    'Amount (Rs)': (expense.amountPaisa / 100).toFixed(2),
    Description: expense.notes ?? '',
    'Payment Method': METHOD_LABELS[expense.method],
  }));
}

interface CategorySlice {
  readonly categoryName: string;
  readonly amountRupees: number;
  readonly amountPaisa: number;
}

interface UnitBar {
  readonly businessUnitCode: string;
  readonly amountRupees: number;
  readonly amountPaisa: number;
}

function byCategory(rows: readonly ExpenseSummaryRowDto[]): readonly CategorySlice[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.categoryName, (totals.get(row.categoryName) ?? 0) + row.totalPaisa);
  }
  return [...totals.entries()].map(([categoryName, totalPaisa]) => ({
    categoryName,
    // divide paisa by 100 for display only
    amountRupees: totalPaisa / 100,
    amountPaisa: totalPaisa,
  }));
}

function byBusinessUnit(rows: readonly ExpenseSummaryRowDto[]): readonly UnitBar[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.businessUnitCode, (totals.get(row.businessUnitCode) ?? 0) + row.totalPaisa);
  }
  return [...totals.entries()].map(([businessUnitCode, totalPaisa]) => ({
    businessUnitCode,
    // divide paisa by 100 for display only
    amountRupees: totalPaisa / 100,
    amountPaisa: totalPaisa,
  }));
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatCategoryTooltip(_value: unknown, _name: unknown, item: unknown): string {
  const payload = (item as { payload?: CategorySlice }).payload;
  return Money.format(Money.of(payload?.amountPaisa ?? 0));
}

function formatUnitTooltip(_value: unknown, _name: unknown, item: unknown): string {
  const payload = (item as { payload?: UnitBar }).payload;
  return Money.format(Money.of(payload?.amountPaisa ?? 0));
}

/**
 * New tab, P10-4 — report:expenseSummary (P10-2d) backs both charts;
 * the existing expense:list channel (Phase 7, unrelated to P10 — its
 * input is already { from, to }) backs the per-row table below, since
 * expenseSummary itself only returns grouped aggregates, not individual
 * rows. No new IPC channel was added for either.
 */
export function ExpensesReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getThisMonth(new Date()));
  const [summary, setSummary] = useState<readonly ExpenseSummaryRowDto[] | null>(null);
  const [expenses, setExpenses] = useState<readonly ExpenseDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSummary(null);
    setExpenses(null);
    setError(null);
    setPage(1);

    ipc.report
      .expenseSummary({ from: range.from, to: range.to })
      .then(setSummary)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load expense summary');
      });

    ipc.expense
      .list({ from: range.from, to: range.to })
      .then(setExpenses)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load expenses');
      });
  }, [range]);

  const categorySlices = summary ? byCategory(summary) : [];
  const unitBars = summary ? byBusinessUnit(summary) : [];
  const visibleExpenses = (expenses ?? []).slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <DateRangeSelector value={range} onChange={setRange} />
        <ExportCsvButton
          disabled={!expenses || expenses.length === 0}
          onClick={() => {
            if (!expenses) return;
            downloadCsv(`expenses-${range.from}-${range.to}.csv`, toCsvRows(expenses));
          }}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {!summary || !expenses ? (
        <LoadingState message="Loading expenses…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium text-ink-muted">By category</p>
              {categorySlices.length === 0 ? (
                <EmptyState message="No data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={[...categorySlices]}
                      dataKey="amountRupees"
                      nameKey="categoryName"
                      outerRadius={80}
                      isAnimationActive={false}
                    >
                      {categorySlices.map((slice, index) => (
                        // eslint-disable-next-line @typescript-eslint/no-deprecated -- recharts v3 deprecated Cell in favor of the `shape` prop; Cell still works until recharts 4.0, migrating is a separate refactor out of P10-4's scope
                        <Cell
                          key={slice.categoryName}
                          fill={PIE_COLORS[index % PIE_COLORS.length] ?? colors.brand.default}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={formatCategoryTooltip} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium text-ink-muted">By business unit</p>
              {unitBars.length === 0 ? (
                <EmptyState message="No data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={[...unitBars]}>
                    <CartesianGrid stroke={colors.line.default} vertical={false} />
                    <XAxis
                      dataKey="businessUnitCode"
                      tick={{ fontSize: 12, fill: colors.ink.muted }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
                    <Tooltip formatter={formatUnitTooltip} />
                    <Bar
                      dataKey="amountRupees"
                      name="Amount"
                      fill={colors.brand.default}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">Expenses</p>
            {expenses.length === 0 ? (
              <EmptyState message="No expenses recorded in this range." />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Date</TableHeaderCell>
                      <TableHeaderCell>Category</TableHeaderCell>
                      <TableHeaderCell>Business Unit</TableHeaderCell>
                      <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                      <TableHeaderCell>Description</TableHeaderCell>
                      <TableHeaderCell>Payment Method</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{expense.expenseDate}</TableCell>
                        <TableCell>{expense.categoryName}</TableCell>
                        <TableCell>{expense.businessUnitCode}</TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay paisaValue={expense.amountPaisa} />
                        </TableCell>
                        <TableCell>{expense.notes ?? '—'}</TableCell>
                        <TableCell>{METHOD_LABELS[expense.method]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  totalRows={expenses.length}
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
