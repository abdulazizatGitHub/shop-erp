import { useEffect, useMemo, useState } from 'react';
import type { StockPerformanceRowDto, StockValuationReportDto } from '@shop/contracts';
import {
  Alert,
  EmptyState,
  LoadingState,
  MoneyDisplay,
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import { DateRangeSelector } from '../../components/shared/DateRangeSelector.js';
import { ExportCsvButton } from '../../components/shared/ExportCsvButton.js';
import { Pagination } from '../../components/shared/Pagination.js';
import { downloadCsv } from '../../utils/exportCsv.js';
import { ipc } from '../../lib/ipc.js';
import { getThisMonth, type DateRange } from '../../utils/dateRanges.js';
import { BestPerformersTable } from './BestPerformersTable.js';

const ROWS_PER_PAGE = 10;

function toCsvRows(lines: StockValuationReportDto['lines']): Record<string, string | number>[] {
  return lines.map((line) => ({
    'Item Name': line.itemName,
    UOM: line.stockUomName,
    // divide milli by 1000 for CSV export
    'Qty on Hand': (line.quantityOnHandMilli / 1000).toFixed(3),
    // divide paisa by 100 for CSV export
    'Last Purchase Cost (Rs)': (line.lastPurchaseCostPaisa / 100).toFixed(2),
    // divide paisa by 100 for CSV export
    'Valuation (Rs)': (line.valuationPaisa / 100).toFixed(2),
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

/**
 * P11-6 — display guard only, no data/query change. Dev database has test
 * data with negative stock (owner-confirmed, pre-go-live cleanup pending);
 * this hides the confusing large negative number rather than fixing the
 * underlying data here.
 */
function InventoryValue({
  totalValuationPaisa,
}: {
  readonly totalValuationPaisa: number;
}): React.JSX.Element {
  if (totalValuationPaisa < 0) {
    return (
      <div>
        <span className="text-xl font-semibold text-ink">—</span>
        <p className="mt-1 text-xs text-danger">Contains invalid stock data.</p>
      </div>
    );
  }
  return <MoneyDisplay paisaValue={totalValuationPaisa} size="xl" />;
}

/**
 * R2 — the stock level table below is always current (all-time), never
 * filtered by DateRangeSelector: only the Best Performers section (from
 * report:stockPerformance) is date-scoped, per P10-4's own instruction.
 */
export function StockValuationReport(): React.JSX.Element {
  const [range, setRange] = useState<DateRange>(() => getThisMonth(new Date()));
  const [report, setReport] = useState<StockValuationReportDto | null>(null);
  const [performance, setPerformance] = useState<readonly StockPerformanceRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [performancePage, setPerformancePage] = useState(1);
  const [stockLevelPage, setStockLevelPage] = useState(1);

  useEffect(() => {
    ipc.report
      .stockValuation()
      .then(setReport)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load stock valuation');
      });
  }, []);

  useEffect(() => {
    setPerformancePage(1);
    ipc.report
      .stockPerformance({ from: range.from, to: range.to })
      .then(setPerformance)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load stock performance');
      });
  }, [range]);

  const filteredLines = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return report.lines;
    return report.lines.filter((line) => line.itemName.toLowerCase().includes(q));
  }, [report, query]);

  // Stock Level's own filter (search) changing must reset its page — a
  // narrower/wider result set at the same page number could otherwise show
  // page 3 of a 2-page result.
  useEffect(() => {
    setStockLevelPage(1);
  }, [query]);

  const visibleLines = filteredLines.slice(
    (stockLevelPage - 1) * ROWS_PER_PAGE,
    stockLevelPage * ROWS_PER_PAGE,
  );

  const itemsInStock = report?.lines.filter((l) => l.quantityOnHandMilli > 0).length ?? 0;
  const itemsOutOfStock = report?.lines.filter((l) => l.quantityOnHandMilli === 0).length ?? 0;

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!report) return <LoadingState message="Loading stock valuation…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Items In Stock"
          value={<span className="text-xl font-semibold text-ink">{itemsInStock}</span>}
        />
        <KpiCard
          label="Items Out of Stock"
          value={<span className="text-xl font-semibold text-danger">{itemsOutOfStock}</span>}
        />
        <KpiCard
          label="Total Inventory Value"
          value={<InventoryValue totalValuationPaisa={report.totalValuationPaisa} />}
        />
      </div>

      <div className="border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-ink-muted">Best Performers</p>
          <div className="flex items-center gap-4">
            <DateRangeSelector value={range} onChange={setRange} />
            <ExportCsvButton
              disabled={report.lines.length === 0}
              onClick={() => {
                downloadCsv(`stock-${range.from}-${range.to}.csv`, toCsvRows(report.lines));
              }}
            />
          </div>
        </div>
        {performance === null ? (
          <LoadingState message="Loading best performers…" />
        ) : (
          <BestPerformersTable
            rows={performance}
            page={performancePage}
            onPageChange={setPerformancePage}
          />
        )}
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-sm font-medium text-ink-muted">Stock Level</p>
        <TextInput
          variant="search"
          placeholder="Search items by name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        {report.lines.length === 0 ? (
          <EmptyState message="No items with stock to value." />
        ) : filteredLines.length === 0 ? (
          <EmptyState message={`No items match "${query}".`} />
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Stock UoM</TableHeaderCell>
                  <TableHeaderCell className="text-right">Qty on Hand</TableHeaderCell>
                  <TableHeaderCell className="text-right">{report.costColumnLabel}</TableHeaderCell>
                  <TableHeaderCell className="text-right">
                    {report.valuationColumnLabel}
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleLines.map((line) => {
                  const outOfStock = line.quantityOnHandMilli === 0;
                  return (
                    <TableRow key={line.itemId}>
                      <TableCell className={outOfStock ? 'text-danger' : ''}>
                        {line.itemName}
                        {outOfStock && ' — Out of Stock'}
                      </TableCell>
                      <TableCell>{line.stockUomName}</TableCell>
                      <TableCell className={`text-right ${outOfStock ? 'text-danger' : ''}`}>
                        <QuantityDisplay quantityMilli={line.quantityOnHandMilli} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={line.lastPurchaseCostPaisa} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={line.valuationPaisa} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              totalRows={filteredLines.length}
              rowsPerPage={ROWS_PER_PAGE}
              currentPage={stockLevelPage}
              onPageChange={setStockLevelPage}
            />
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
        <span className="text-lg font-semibold text-ink">Total Valuation</span>
        <MoneyDisplay paisaValue={report.totalValuationPaisa} size="xl" />
      </div>
    </div>
  );
}
