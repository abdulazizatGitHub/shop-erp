import type { JobDto } from '@shop/contracts';
import { MoneyDisplay } from '@shop/ui';
import { PromisedDateField } from './PromisedDateField.js';
import { TechnicianAssignmentPanel } from './TechnicianAssignmentPanel.js';

const JOB_TYPE_LABELS: Record<string, string> = {
  in_shop: 'In shop',
  on_site: 'On site',
  installation: 'Installation',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

const SECTION_CLASSES = 'py-4 border-b border-gray-100 last:border-b-0 first:pt-0 last:pb-0';
const LABEL_CLASSES = 'mb-1 text-xs font-medium uppercase tracking-wider text-gray-400';
const VALUE_CLASSES = 'text-sm font-medium text-gray-900';

export interface JobPropertyPanelProps {
  readonly job: JobDto;
  readonly technicians: ReadonlyArray<{ id: string; name: string }>;
  /** Resolved name for job.customerId — null while loading or when there is no registered customer. */
  readonly customerName: string | null;
  readonly onJobChanged: (updated: JobDto) => void;
  /** P14-2/OD-6 — navigates to CustomerDetailPage for job.customerId. Only
   * called when job.customerId is set (the name is plain text otherwise —
   * an adhoc walk-in job predating P14-2 has no registered customer to
   * link to). */
  readonly onNavigateToCustomer: (customerId: string) => void;
}

/** The right-column card: customer, technician, status, dates, estimate,
 * job type — each section separated by a thin border, per the P6.5 brief. */
export function JobPropertyPanel({
  job,
  technicians,
  customerName,
  onJobChanged,
  onNavigateToCustomer,
}: JobPropertyPanelProps): React.JSX.Element {
  return (
    // F2 — confirmed by reading: no shadow class existed here before.
    // Added the same subtle shadow the other job-card sections use,
    // border kept as-is (additive change, not a full re-style).
    <div className="w-72 flex-shrink-0 rounded-xl border border-gray-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
      <section className={SECTION_CLASSES}>
        <p className={LABEL_CLASSES}>Client</p>
        {job.customerNameAdhoc ? (
          <>
            <p className={VALUE_CLASSES}>{job.customerNameAdhoc}</p>
            {job.customerPhone && <p className="text-sm text-gray-500">{job.customerPhone}</p>}
          </>
        ) : job.customerId ? (
          <>
            <button
              type="button"
              onClick={() => {
                onNavigateToCustomer(job.customerId as string);
              }}
              className={`${VALUE_CLASSES} text-left underline decoration-dotted hover:text-blue-700`}
            >
              {customerName ?? '…'}
            </button>
            {job.customerPhone && <p className="text-sm text-gray-500">{job.customerPhone}</p>}
          </>
        ) : (
          <p className="text-sm text-gray-400">Walk-in customer</p>
        )}
      </section>

      <section className={SECTION_CLASSES}>
        <TechnicianAssignmentPanel
          job={job}
          technicians={technicians}
          onJobChanged={onJobChanged}
        />
      </section>

      <section className={SECTION_CLASSES}>
        <p className={LABEL_CLASSES}>Received</p>
        <p className={VALUE_CLASSES}>{formatDate(job.receivedDate)}</p>
      </section>

      <section className={SECTION_CLASSES}>
        <PromisedDateField job={job} onJobChanged={onJobChanged} />
      </section>

      {job.estimateAmountPaisa !== null && (
        <section className={SECTION_CLASSES}>
          <p className={LABEL_CLASSES}>Estimate</p>
          <MoneyDisplay paisaValue={job.estimateAmountPaisa} size="sm" />
          <p className={`text-xs ${job.estimateApproved ? 'text-green-600' : 'text-gray-400'}`}>
            {job.estimateApproved ? 'Approved' : 'Not approved'}
          </p>
        </section>
      )}

      <section className={SECTION_CLASSES}>
        <p className={LABEL_CLASSES}>Job Type</p>
        <p className={VALUE_CLASSES}>{JOB_TYPE_LABELS[job.jobType] ?? job.jobType}</p>
      </section>
    </div>
  );
}
