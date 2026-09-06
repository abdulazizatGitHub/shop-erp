import type { ExpenseDto } from '@shop/contracts';
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

const METHOD_LABELS: Record<string, string> = {
  cash: 'Till',
  owner_personal: 'Owner',
};

export interface ExpenseListTableProps {
  readonly expenses: readonly ExpenseDto[];
}

export function ExpenseListTable({ expenses }: ExpenseListTableProps): React.JSX.Element {
  if (expenses.length === 0) {
    return <EmptyState message="No expenses in this date range." />;
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Date</TableHeaderCell>
          <TableHeaderCell>Category</TableHeaderCell>
          <TableHeaderCell className="text-right">Amount</TableHeaderCell>
          <TableHeaderCell>Unit</TableHeaderCell>
          <TableHeaderCell>Method</TableHeaderCell>
          <TableHeaderCell>Notes</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {expenses.map((expense) => (
          <TableRow key={expense.id}>
            <TableCell>{expense.expenseDate}</TableCell>
            <TableCell>{expense.categoryName}</TableCell>
            <TableCell className="text-right">
              <MoneyDisplay paisaValue={expense.amountPaisa} />
            </TableCell>
            <TableCell>{expense.businessUnitCode}</TableCell>
            <TableCell>{METHOD_LABELS[expense.method] ?? expense.method}</TableCell>
            <TableCell>{expense.notes ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
