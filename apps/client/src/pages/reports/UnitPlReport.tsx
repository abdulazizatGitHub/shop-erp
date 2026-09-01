import { useEffect, useState } from 'react';
import type { UnitPlReportDto } from '@shop/contracts';
import {
  Alert,
  LoadingState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

/** R5 — no inputs; the date range is computed server-side (effectively all-time). */
export function UnitPlReport(): React.JSX.Element {
  const [report, setReport] = useState<UnitPlReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.report
      .unitPl()
      .then(setReport)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load unit P&L');
      });
  }, []);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!report) return <LoadingState message="Loading unit P&L…" />;

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Business Unit</TableHeaderCell>
            <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
            <TableHeaderCell className="text-right">
              {report.rows[0]?.cogsColumnLabel ?? 'COGS'}
            </TableHeaderCell>
            <TableHeaderCell className="text-right">Direct Margin</TableHeaderCell>
            <TableHeaderCell className="text-right">Margin %</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {report.rows.map((row) => (
            <TableRow key={row.unitCode}>
              <TableCell className={row.unitCode === 'TOTAL' ? 'font-semibold' : ''}>
                {row.unitName}
              </TableCell>
              <TableCell className="text-right">
                <MoneyDisplay paisaValue={row.revenuePaisa} />
              </TableCell>
              <TableCell className="text-right">
                <MoneyDisplay paisaValue={row.cogsPaisa} />
              </TableCell>
              <TableCell className="text-right">
                <MoneyDisplay paisaValue={row.directMarginPaisa} />
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-ink">
                {row.directMarginPercent.toFixed(2)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-ink-faint">{report.disclaimer}</p>
    </div>
  );
}
