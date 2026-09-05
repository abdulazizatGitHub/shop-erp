import { useEffect, useState } from 'react';
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
import type { JobSplitRecord } from '../../types/electron-api.js';
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
 * job:getJobSplit only takes one jobId (see v_job_split, packages/core's
 * JobRepositoryPort) — there is no date-ranged list version. This filters
 * job:list's receivedDate client-side, then fans out one getJobSplit call
 * per job in the range. Fine for a repair shop's job volumes; flagged as
 * a known N+1 in PHASE_6.md §8 rather than adding a new read endpoint mid-session.
 */
export function JobSplitReport(): React.JSX.Element {
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [rows, setRows] = useState<readonly JobSplitRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    ipc.job
      .list({ status: null, assignedTo: null, customerId: null })
      .then(async (jobs) => {
        const inRange = jobs.filter((j) => j.receivedDate >= dateFrom && j.receivedDate <= dateTo);
        const splits = await Promise.all(inRange.map((j) => ipc.job.getJobSplit(j.id)));
        setRows(splits.filter((s): s is JobSplitRecord => s !== null));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load job split report');
      });
  }, [dateFrom, dateTo]);

  const partsMarginPaisa = rows ? rows.reduce((sum, r) => sum + r.partsMarginPaisa, 0) : 0;
  const labourChargePaisa = rows ? rows.reduce((sum, r) => sum + r.labourChargePaisa, 0) : 0;
  const totalBillPaisa = rows ? rows.reduce((sum, r) => sum + r.totalBillPaisa, 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <label className="flex w-56 flex-col gap-1 text-sm text-ink-muted">
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
        <label className="flex w-56 flex-col gap-1 text-sm text-ink-muted">
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

      {rows === null ? (
        <LoadingState message="Loading job split…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              label="Parts Margin"
              value={<MoneyDisplay paisaValue={partsMarginPaisa} size="xl" tone="in" />}
            />
            <KpiCard
              label="Labour Revenue"
              value={<MoneyDisplay paisaValue={labourChargePaisa} size="xl" tone="in" />}
            />
            <KpiCard
              label="Total Billed"
              value={<MoneyDisplay paisaValue={totalBillPaisa} size="xl" />}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState message="No jobs received in this date range." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Job No</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Customer</TableHeaderCell>
                  <TableHeaderCell>Technician</TableHeaderCell>
                  <TableHeaderCell className="text-right">Parts Margin</TableHeaderCell>
                  <TableHeaderCell className="text-right">Labour</TableHeaderCell>
                  <TableHeaderCell className="text-right">Total</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.jobId}>
                    <TableCell>{r.docNo}</TableCell>
                    <TableCell>{r.receivedDate}</TableCell>
                    <TableCell>{r.customerName ?? 'Walk-in'}</TableCell>
                    <TableCell>{r.technicianName ?? 'Unassigned'}</TableCell>
                    <TableCell className="text-right">
                      <MoneyDisplay paisaValue={r.partsMarginPaisa} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyDisplay paisaValue={r.labourChargePaisa} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyDisplay paisaValue={r.totalBillPaisa} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
