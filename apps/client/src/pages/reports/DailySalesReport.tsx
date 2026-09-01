import { useEffect, useState } from 'react';
import type { DailySalesReportRowDto, SaleSummaryDto } from '@shop/contracts';
import {
  Alert,
  Badge,
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
 * R1 — a date input (default today) drives two independent IPC calls:
 * report:dailySales (the four KPI numbers) and the already-wired-but-
 * previously-untyped sale:listByDate (the per-sale table) — the
 * repository has no single function returning both, see the P4.5-6
 * kickoff discussion.
 */
export function DailySalesReport(): React.JSX.Element {
  const [date, setDate] = useState(todayIso());
  const [summary, setSummary] = useState<readonly DailySalesReportRowDto[] | null>(null);
  const [sales, setSales] = useState<readonly SaleSummaryDto[] | null>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(null);
    setSales(null);
    setError(null);

    ipc.report
      .dailySales({ date })
      .then(setSummary)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load daily sales summary');
      });

    ipc.sale
      .listByDate({ dateFrom: date, dateTo: date, customerId: null, status: null })
      .then((rows) => {
        setSales(rows);
        const uniqueIds = [...new Set(rows.map((r) => r.customerId).filter((id) => id !== null))];
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
        setError(err instanceof Error ? err.message : 'Failed to load sales for this date');
      });
  }, [date]);

  const row = summary?.[0] ?? {
    invoiceCount: 0,
    totalSalesPaisa: 0,
    cashCollectedPaisa: 0,
    creditGivenPaisa: 0,
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex w-56 flex-col gap-1 text-sm text-ink-muted">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
        />
      </label>

      {error && <Alert variant="danger">{error}</Alert>}

      {!summary || !sales ? (
        <LoadingState message="Loading daily sales…" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              label="Total Sales"
              value={<MoneyDisplay paisaValue={row.totalSalesPaisa} size="xl" />}
            />
            <KpiCard
              label="Cash"
              value={<MoneyDisplay paisaValue={row.cashCollectedPaisa} size="xl" tone="in" />}
            />
            <KpiCard
              label="Credit"
              value={<MoneyDisplay paisaValue={row.creditGivenPaisa} size="xl" tone="due" />}
            />
            <KpiCard
              label="Transactions"
              value={
                <span className="font-mono text-xl tabular-nums text-ink">{row.invoiceCount}</span>
              }
            />
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-muted">Sales on this date</p>
            {sales.length === 0 ? (
              <EmptyState message="No sales recorded on this date." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Doc No</TableHeaderCell>
                    <TableHeaderCell>Customer</TableHeaderCell>
                    <TableHeaderCell>Payment</TableHeaderCell>
                    <TableHeaderCell className="text-right">Total</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
