import { useEffect, useState } from 'react';
import type { CashBookRowDto } from '@shop/contracts';
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
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * R4 — date-from/date-to, default last 30 days. Running balance IS shown:
 * the repository's real return type (CashBookRow) includes
 * runningBalancePaisa, confirmed by reading report.repository.ts before
 * building this — the original "may not be included" hedge turned out
 * not to apply.
 */
export function CashBookReport(): React.JSX.Element {
  const [dateFrom, setDateFrom] = useState(() => daysAgoIso(30));
  const [dateTo, setDateTo] = useState(() => todayIso());
  const [rows, setRows] = useState<readonly CashBookRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    ipc.report
      .cashBook({ dateFrom, dateTo })
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load cash book');
      });
  }, [dateFrom, dateTo]);

  const totalInPaisa = Money.sum((rows ?? []).map((r) => Money.of(r.inPaisa)));
  const totalOutPaisa = Money.sum((rows ?? []).map((r) => Money.of(r.outPaisa)));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
            }}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
            }}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {!rows && !error && <LoadingState message="Loading cash book…" />}
      {rows &&
        (rows.length === 0 ? (
          <EmptyState message="No cash movements in this date range." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Description</TableHeaderCell>
                <TableHeaderCell>Doc No</TableHeaderCell>
                <TableHeaderCell className="text-right">In</TableHeaderCell>
                <TableHeaderCell className="text-right">Out</TableHeaderCell>
                <TableHeaderCell className="text-right">Running Balance</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${row.docNo}-${String(index)}`}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>{row.docNo}</TableCell>
                  <TableCell className="text-right">
                    {row.inPaisa > 0 ? <MoneyDisplay paisaValue={row.inPaisa} tone="in" /> : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.outPaisa > 0 ? <MoneyDisplay paisaValue={row.outPaisa} tone="out" /> : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyDisplay paisaValue={row.runningBalancePaisa} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      {rows && rows.length > 0 && (
        <div className="flex items-center justify-end gap-6 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-muted">Total In</span>
            <MoneyDisplay paisaValue={totalInPaisa} size="lg" tone="in" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-muted">Total Out</span>
            <MoneyDisplay paisaValue={totalOutPaisa} size="lg" tone="out" />
          </div>
        </div>
      )}
    </div>
  );
}
