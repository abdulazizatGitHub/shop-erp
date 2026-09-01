import { useEffect, useMemo, useState } from 'react';
import type { StockValuationReportDto } from '@shop/contracts';
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
import { ipc } from '../../lib/ipc.js';

/** R2 — no inputs; the search box below filters the already-loaded lines in memory. */
export function StockValuationReport(): React.JSX.Element {
  const [report, setReport] = useState<StockValuationReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    ipc.report
      .stockValuation()
      .then(setReport)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load stock valuation');
      });
  }, []);

  const filteredLines = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return report.lines;
    return report.lines.filter((line) => line.itemName.toLowerCase().includes(q));
  }, [report, query]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!report) return <LoadingState message="Loading stock valuation…" />;

  return (
    <div className="flex flex-col gap-4">
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
            {filteredLines.map((line) => (
              <TableRow key={line.itemId}>
                <TableCell>{line.itemName}</TableCell>
                <TableCell>{line.stockUomName}</TableCell>
                <TableCell className="text-right">
                  <QuantityDisplay quantityMilli={line.quantityOnHandMilli} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={line.lastPurchaseCostPaisa} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={line.valuationPaisa} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
        <span className="text-lg font-semibold text-ink">Total Valuation</span>
        <MoneyDisplay paisaValue={report.totalValuationPaisa} size="xl" />
      </div>
    </div>
  );
}
