import { useEffect, useState } from 'react';
import type { ItemSoldSummaryRowDto } from '@shop/contracts';
import {
  EmptyState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { Pagination } from '../../components/shared/Pagination.js';

const ROWS_PER_PAGE = 10;

export interface ItemsSoldTableProps {
  readonly rows: readonly ItemSoldSummaryRowDto[];
}

/** e.g. "2.000 Piece" — totalSoldMilli / 1000 to 3 decimals, unit name appended. */
function formatQtySold(totalSoldMilli: number, unitName: string): string {
  return `${(totalSoldMilli / 1000).toFixed(3)} ${unitName}`;
}

/** P11-5 Section 5 — "What Was Sold", already sorted by revenuePaisa DESC (report:itemSoldSummary's own sort order). */
export function ItemsSoldTable({ rows }: ItemsSoldTableProps): React.JSX.Element {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  if (rows.length === 0) {
    return <EmptyState message="No items sold in this period." />;
  }

  const visible = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Item Name</TableHeaderCell>
            <TableHeaderCell>Unit</TableHeaderCell>
            <TableHeaderCell className="text-right">Qty Sold</TableHeaderCell>
            <TableHeaderCell className="text-right">Revenue (Rs)</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.itemId}>
              <TableCell>{row.itemName}</TableCell>
              <TableCell>{row.unitName}</TableCell>
              <TableCell className="text-right">
                {formatQtySold(row.totalSoldMilli, row.unitName)}
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
        onPageChange={setPage}
      />
    </>
  );
}
