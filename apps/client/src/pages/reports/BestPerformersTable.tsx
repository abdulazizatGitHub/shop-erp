import type { StockPerformanceRowDto } from '@shop/contracts';
import {
  EmptyState,
  MoneyDisplay,
  QuantityDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { Pagination } from '../../components/shared/Pagination.js';

const ROWS_PER_PAGE = 10;

export interface BestPerformersTableProps {
  readonly rows: readonly StockPerformanceRowDto[];
  readonly page: number;
  readonly onPageChange: (page: number) => void;
}

/**
 * P11-3 — previously hard-capped to the top 10 rows client-side; owner
 * decided (Phase 11 pre-code audit) to drop that cap so the full
 * report:stockPerformance result (every track_stock item, per P10-2c) is
 * shown here, paginated like every other long table, rather than a
 * permanently-uncappable "top 10" that Pagination could never page through.
 * P11-6 — extracted from StockValuationReport.tsx to keep that file under
 * the 300-line cap after the negative-valuation guard was added.
 */
export function BestPerformersTable({
  rows,
  page,
  onPageChange,
}: BestPerformersTableProps): React.JSX.Element {
  if (rows.length === 0) {
    return <EmptyState message="No data for this period." />;
  }
  const visible = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
  return (
    <>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Item Name</TableHeaderCell>
            <TableHeaderCell>Unit</TableHeaderCell>
            <TableHeaderCell className="text-right">Stock</TableHeaderCell>
            <TableHeaderCell className="text-right">Units Sold</TableHeaderCell>
            <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.itemId}>
              <TableCell>{row.itemName}</TableCell>
              <TableCell>{row.unitName}</TableCell>
              <TableCell className="text-right">
                <QuantityDisplay quantityMilli={row.quantityMilli} />
              </TableCell>
              <TableCell className="text-right">
                <QuantityDisplay quantityMilli={row.totalSoldMilli} />
              </TableCell>
              <TableCell className="text-right">
                <MoneyDisplay paisaValue={row.revenuePaisa} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        totalRows={rows.length}
        rowsPerPage={ROWS_PER_PAGE}
        currentPage={page}
        onPageChange={onPageChange}
      />
    </>
  );
}
