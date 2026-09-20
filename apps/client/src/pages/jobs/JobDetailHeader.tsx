import type { JobStatus } from '@shop/contracts';
import { Button } from '@shop/ui';

/** DEBT-1 (PROJECT.md): raw Tailwind palette, not this project's named
 * tokens — same owner-approved exception used elsewhere in Jobs (was
 * JobDetailsSidebar's STATUS_PILL_CLASSES; that file is now retired and
 * this is the map's single source for the whole Job detail redesign). */
export const STATUS_PILL_CLASSES: Record<JobStatus, string> = {
  received: 'bg-blue-50 text-blue-700 border border-blue-200',
  diagnosed: 'bg-violet-50 text-violet-700 border border-violet-200',
  awaiting_parts: 'bg-orange-50 text-orange-700 border border-orange-200',
  awaiting_approval: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  in_progress: 'bg-amber-50 text-amber-700 border border-amber-200',
  ready: 'bg-green-50 text-green-700 border border-green-200',
  delivered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
};

/**
 * P14-8 — every status badge in the app (this file's own pill, the
 * sidebar status section, the jobs list) actually renders `{status}`
 * verbatim, with no label transform at all; the only partial precedent
 * is JobsPage.tsx's 4-entry STATUS_FILTERS (received/in_progress/ready/
 * delivered only). Extends that same Title Case convention to all 8
 * statuses, single source, rather than inventing a separate vocabulary —
 * used by the History panel's "Status changed to [label]" events.
 */
export const STATUS_LABELS: Record<JobStatus, string> = {
  received: 'Received',
  diagnosed: 'Diagnosed',
  awaiting_parts: 'Awaiting Parts',
  awaiting_approval: 'Awaiting Approval',
  in_progress: 'In Progress',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export interface JobDetailHeaderProps {
  readonly docNo: string;
  readonly applianceType: string | null;
  readonly applianceBrand: string | null;
  readonly reportedFault: string | null;
  /** P14-6 — when set, this is the primary fault line; reportedFault
   * drops to a secondary "Reported by customer:" line below it. */
  readonly diagnosedFault: string | null;
  readonly status: JobStatus;
  /** G3 — set only once delivered (deliveredNotice?.docNo ?? job.invoiceDocNo);
   * null otherwise. Renders as a muted "Invoice ..." line under the subtitle. */
  readonly invoiceDocNo: string | null;
  /** G3 — Print Invoice only renders once the job has a sale to print. */
  readonly saleId: string | null;
  readonly printing: boolean;
  readonly onPrintInvoice: () => void;
  readonly onBack: () => void;
  readonly onOpenDeliver: () => void;
  /** P14-4 — same eligibility as Deliver: hidden once delivered/cancelled. */
  readonly onOpenCancel: () => void;
}

/** Sticky top header: back link + job number/appliance line on the left,
 * status pill + Cancel/Deliver buttons on the right. Cancel/Deliver are
 * hidden once the job is delivered/cancelled; Print Invoice takes their
 * place once delivered (G3 — was a floating block below the card). */
export function JobDetailHeader({
  docNo,
  applianceType,
  applianceBrand,
  reportedFault,
  diagnosedFault,
  status,
  invoiceDocNo,
  saleId,
  printing,
  onPrintInvoice,
  onBack,
  onOpenDeliver,
  onOpenCancel,
}: JobDetailHeaderProps): React.JSX.Element {
  const canDeliver = status !== 'delivered' && status !== 'cancelled';
  const applianceLine = `${applianceType ?? '—'} · ${applianceBrand ?? '—'}`;

  return (
    // F2 — was `sticky top-0 z-10 ... border-b`, edge-to-edge; converted to
    // the same rounded card-with-shadow treatment Parts & Labour/History
    // use (V5). Sticky positioning was dropped as part of this — a card
    // with visible margin around it doesn't read correctly pinned to the
    // very top edge while content scrolls under it.
    <div className="flex items-center justify-between rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-1 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <span aria-hidden="true">←</span> Jobs
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{docNo}</h1>
        {diagnosedFault ? (
          <>
            <p className="text-sm text-gray-500">
              {applianceLine} · {diagnosedFault}
            </p>
            <p className="text-xs text-gray-400">Reported by customer: {reportedFault ?? '—'}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            {applianceLine} · {reportedFault ?? '—'}
          </p>
        )}
        {status === 'delivered' && (
          <p className="mt-1 text-xs text-gray-400">Invoice {invoiceDocNo ?? 'recorded'}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span
          className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${STATUS_PILL_CLASSES[status]}`}
        >
          {status}
        </span>
        {status === 'delivered' && saleId && (
          <Button variant="secondary" disabled={printing} onClick={onPrintInvoice}>
            Print Invoice
          </Button>
        )}
        {canDeliver && (
          <button
            type="button"
            onClick={onOpenCancel}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Cancel job
          </button>
        )}
        {canDeliver && (
          <button
            type="button"
            onClick={onOpenDeliver}
            className="rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Deliver &amp; Invoice
          </button>
        )}
      </div>
    </div>
  );
}
