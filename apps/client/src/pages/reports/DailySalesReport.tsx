import { useEffect, useState } from 'react';
import type { ItemSoldSummaryRowDto, PeriodComparisonDto, SaleSummaryDto } from '@shop/contracts';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  LoadingState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { DateRangeSelector } from '../../components/shared/DateRangeSelector.js';
import { ExportCsvButton } from '../../components/shared/ExportCsvButton.js';
import { Pagination } from '../../components/shared/Pagination.js';
import { downloadCsv } from '../../utils/exportCsv.js';
import { ipc } from '../../lib/ipc.js';
import { getPreviousPeriod, getToday, type DateRange } from '../../utils/dateRanges.js';
import { CashCreditPie } from './CashCreditPie.js';
import { ItemsSoldTable } from './ItemsSoldTable.js';
import { SalesSummaryCards } from './SalesSummaryCards.js';
import { SalesTrendChart } from './SalesTrendChart.js';

const ROWS_PER_PAGE = 10;

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

/**
 * P11-5 — one useEffect, one Promise.all, three parallel IPC calls:
 * sale.listByDate (Transactions table + CSV — report:dailySales can't
 * supply per-invoice rows), report.periodComparison (Sections 2 & 3 —
 * supersedes the old standalone report:dailySales call, since
 * comparison.current is the same day-bucket data), report.itemSoldSummary
 * (Section 5). Single loading/error state covers all three.
 */
export function DailySalesReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getToday(new Date()));
  const [sales, setSales] = useState<readonly SaleSummaryDto[] | null>(null);
  const [comparison, setComparison] = useState<PeriodComparisonDto | null>(null);
  const [itemSummary, setItemSummary] = useState<readonly ItemSoldSummaryRowDto[] | null>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const previousRange = getPreviousPeriod(range);

  useEffect(() => {
    setSales(null);
    setComparison(null);
    setItemSummary(null);
    setError(null);
    setPage(1);

    Promise.all([
      ipc.sale.listByDate({
        dateFrom: range.from,
        dateTo: range.to,
        customerId: null,
        status: null,
      }),
      ipc.report.periodComparison({
        current: { from: range.from, to: range.to },
        previous: getPreviousPeriod(range),
      }),
      ipc.report.itemSoldSummary({ from: range.from, to: range.to }),
    ])
      .then(([salesRows, comparisonResult, itemRows]) => {
        setSales(salesRows);
        setComparison(comparisonResult);
        setItemSummary(itemRows);

        const uniqueIds = [
          ...new Set(salesRows.map((r) => r.customerId).filter((id) => id !== null)),
        ];
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
        setError(err instanceof Error ? err.message : 'Failed to load Sales summary');
      });
  }, [range]);

  const visibleSales = (sales ?? []).slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <DateRangeSelector value={range} onChange={setRange} />
        <ExportCsvButton
          disabled={!sales || sales.length === 0}
          onClick={() => {
            if (!sales) return;
            downloadCsv(`sales-${range.from}-${range.to}.csv`, toCsvRows(sales, customerNames));
          }}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {!sales || !comparison || !itemSummary ? (
        <LoadingState message="Loading Sales…" />
      ) : (
        <>
          <Card title="Summary">
            <SalesSummaryCards
              current={comparison.current}
              previous={comparison.previous}
              from={range.from}
            />
          </Card>

          <Card title="Sales Trend">
            <SalesTrendChart
              current={comparison.current}
              previous={comparison.previous}
              currentRange={range}
              previousRange={previousRange}
            />
          </Card>

          <Card title="Cash vs Credit">
            <CashCreditPie current={comparison.current} />
          </Card>

          <Card title="What Was Sold">
            <ItemsSoldTable rows={itemSummary} />
          </Card>

          <Card title="Transactions">
            {sales.length === 0 ? (
              <EmptyState message="No sales recorded in this range." />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Date</TableHeaderCell>
                      <TableHeaderCell>Doc No</TableHeaderCell>
                      <TableHeaderCell>Customer</TableHeaderCell>
                      <TableHeaderCell>Payment</TableHeaderCell>
                      <TableHeaderCell className="text-right">Total (Rs)</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{sale.saleDate}</TableCell>
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
                <Pagination
                  totalRows={sales.length}
                  rowsPerPage={ROWS_PER_PAGE}
                  currentPage={page}
                  onPageChange={setPage}
                />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
