import { Clock, Printer } from 'lucide-react';
import type { JobSummaryDto } from '@shop/contracts';
import { TableCell } from '@shop/ui';
import { STATUS_PILL_CLASSES } from './JobDetailHeader.js';
import { isJobOverdue, isJobStale } from './job-list-indicators.js';

/** Truncates the fault text for the table column — the full text is on the job detail page. */
function truncate(text: string | null, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface JobsTableRowProps {
  readonly job: JobSummaryDto;
  readonly customerLabel: string;
  readonly technicianLabel: string;
  readonly onSelect: () => void;
  readonly onPrint: () => void;
  readonly printing: boolean;
}

/**
 * P14-7 — one row. Split out of JobsPage.tsx to keep that file under the
 * 300-line convention once search/print/indicators all landed there too.
 * Overdue (red dot) / stale (amber clock) use the shared danger/warning
 * Tailwind tokens (packages/ui/src/tokens/colors.ts → text-danger/
 * text-warning, confirmed present in apps/client/tailwind.config.js) —
 * never a hardcoded colour string.
 */
export function JobsTableRow({
  job,
  customerLabel,
  technicianLabel,
  onSelect,
  onPrint,
  printing,
}: JobsTableRowProps): React.JSX.Element {
  const overdue = isJobOverdue(job);
  const stale = isJobStale(job);
  const fault = job.diagnosedFault ?? job.reportedFault;

  return (
    // Raw <tr> (not the shared TableRow) so the whole row — not each cell
    // separately — gets one cursor-pointer/hover treatment on click, per
    // the P6.5 brief.
    <tr className="cursor-pointer even:bg-surface-sunken hover:bg-gray-50" onClick={onSelect}>
      <TableCell>{job.docNo}</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1">
          {stale && (
            <Clock
              size={14}
              className="text-warning"
              aria-label="Stale — no promised date, over 14 days since intake"
            />
          )}
          {job.receivedDate}
        </span>
      </TableCell>
      <TableCell>{customerLabel}</TableCell>
      <TableCell>{job.applianceType ?? '—'}</TableCell>
      <TableCell>{job.applianceBrand ?? '—'}</TableCell>
      <TableCell className="max-w-xs truncate" title={fault ?? undefined}>
        {truncate(fault, 40)}
      </TableCell>
      <TableCell>{technicianLabel}</TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1">
          {overdue && (
            <span className="text-danger" aria-label="Overdue">
              ●
            </span>
          )}
          {job.promisedDate ?? '—'}
        </span>
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASSES[job.status]}`}
        >
          {job.status}
        </span>
      </TableCell>
      <TableCell>
        {job.status === 'delivered' && job.saleId && (
          <button
            type="button"
            aria-label="Print invoice"
            disabled={printing}
            onClick={(e) => {
              e.stopPropagation();
              onPrint();
            }}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Printer size={16} aria-hidden="true" />
          </button>
        )}
      </TableCell>
    </tr>
  );
}
