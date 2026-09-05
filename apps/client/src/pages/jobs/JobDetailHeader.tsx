import type { JobStatus } from '@shop/contracts';

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

export interface JobDetailHeaderProps {
  readonly docNo: string;
  readonly applianceType: string | null;
  readonly applianceBrand: string | null;
  readonly reportedFault: string | null;
  readonly status: JobStatus;
  readonly onBack: () => void;
  readonly onOpenDeliver: () => void;
}

/** Sticky top header: back link + job number/appliance line on the left,
 * status pill + Deliver button on the right. Deliver is hidden once the
 * job is delivered/cancelled — nothing left to deliver. */
export function JobDetailHeader({
  docNo,
  applianceType,
  applianceBrand,
  reportedFault,
  status,
  onBack,
  onOpenDeliver,
}: JobDetailHeaderProps): React.JSX.Element {
  const canDeliver = status !== 'delivered' && status !== 'cancelled';

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-1 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <span aria-hidden="true">←</span> Jobs
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{docNo}</h1>
        <p className="text-sm text-gray-500">
          {applianceType ?? '—'} · {applianceBrand ?? '—'} · {reportedFault ?? '—'}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <span
          className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${STATUS_PILL_CLASSES[status]}`}
        >
          {status}
        </span>
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
