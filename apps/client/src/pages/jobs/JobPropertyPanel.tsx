import { useState } from 'react';
import type { JobDto, JobStatus } from '@shop/contracts';
import { MoneyDisplay, Select } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { STATUS_PILL_CLASSES } from './JobDetailHeader.js';

/** Only the transitions this redesign's brief specifies — carried over
 * unchanged from the retired JobDetailsSidebar.tsx. `awaiting_approval`
 * isn't routed through by the new flow, so it's a dead end here (pill
 * only) rather than inventing transitions for a state the brief never
 * mentions. `ready` has no status transition — Deliver is the only way
 * forward from there. */
const FORWARD_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  received: ['diagnosed', 'cancelled'],
  diagnosed: ['awaiting_parts', 'in_progress', 'cancelled'],
  awaiting_approval: [],
  awaiting_parts: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: [],
  delivered: [],
  cancelled: [],
};

const JOB_TYPE_LABELS: Record<string, string> = {
  in_shop: 'In shop',
  on_site: 'On site',
  installation: 'Installation',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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
}

/** The right-column card: customer, technician, status, dates, estimate,
 * job type — each section separated by a thin border, per the P6.5 brief. */
export function JobPropertyPanel({
  job,
  technicians,
  customerName,
  onJobChanged,
}: JobPropertyPanelProps): React.JSX.Element {
  const [editingTechnician, setEditingTechnician] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [technicianError, setTechnicianError] = useState<string | null>(null);

  const [editingStatus, setEditingStatus] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const currentTechnicianName = technicians.find((t) => t.id === job.assignedTo)?.name ?? null;
  const nextStatuses = FORWARD_TRANSITIONS[job.status];
  const isPromisedOverdue =
    job.promisedDate !== null && job.promisedDate < todayIso() && job.status !== 'delivered';

  async function handleAssign(technicianPartyId: string): Promise<void> {
    if (technicianPartyId.length === 0) return;
    setAssigning(true);
    setTechnicianError(null);
    try {
      const updated = await ipc.job.assignTechnician({ jobId: job.id, technicianPartyId });
      onJobChanged(updated);
      setEditingTechnician(false);
    } catch (err) {
      setTechnicianError(err instanceof Error ? err.message : 'Failed to assign technician');
    } finally {
      setAssigning(false);
    }
  }

  async function handleTransition(toStatus: string): Promise<void> {
    if (toStatus.length === 0) return;
    setTransitioning(true);
    setStatusError(null);
    try {
      const updated = await ipc.job.transitionStatus({
        jobId: job.id,
        toStatus: toStatus as JobStatus,
        note: null,
      });
      onJobChanged(updated);
      setEditingStatus(false);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to change status');
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="w-72 flex-shrink-0 rounded-xl border border-gray-200 bg-white p-5">
      <section className={SECTION_CLASSES}>
        <p className={LABEL_CLASSES}>Customer</p>
        {job.customerNameAdhoc ? (
          <>
            <p className={VALUE_CLASSES}>{job.customerNameAdhoc}</p>
            {job.customerPhone && <p className="text-sm text-gray-500">{job.customerPhone}</p>}
          </>
        ) : job.customerId ? (
          <>
            <p className={VALUE_CLASSES}>{customerName ?? '…'}</p>
            {job.customerPhone && <p className="text-sm text-gray-500">{job.customerPhone}</p>}
          </>
        ) : (
          <p className="text-sm text-gray-400">Walk-in customer</p>
        )}
      </section>

      <section className={SECTION_CLASSES}>
        <p className={LABEL_CLASSES}>Technician</p>
        {editingTechnician ? (
          <Select
            aria-label="Technician"
            autoFocus
            disabled={assigning}
            defaultValue=""
            onChange={(e) => {
              void handleAssign(e.target.value);
            }}
            onBlur={() => {
              setEditingTechnician(false);
            }}
          >
            <option value="" disabled>
              Select…
            </option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingTechnician(true);
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm transition-colors hover:border-blue-400 hover:bg-blue-50"
          >
            <span className="text-gray-400">👤</span>
            <span
              className={
                currentTechnicianName ? 'font-medium text-gray-900' : 'italic text-gray-400'
              }
            >
              {currentTechnicianName ?? 'Unassigned — tap to assign'}
            </span>
          </button>
        )}
        {technicianError && <p className="mt-1 text-xs text-red-600">{technicianError}</p>}
      </section>

      <section className={SECTION_CLASSES}>
        <p className={LABEL_CLASSES}>Status</p>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL_CLASSES[job.status]}`}
        >
          {job.status}
        </span>
        {nextStatuses.length > 0 &&
          (editingStatus ? (
            <div className="mt-1">
              <Select
                aria-label="Change status"
                autoFocus
                disabled={transitioning}
                defaultValue=""
                onChange={(e) => {
                  void handleTransition(e.target.value);
                }}
                onBlur={() => {
                  setEditingStatus(false);
                }}
              >
                <option value="" disabled>
                  Move to...
                </option>
                {nextStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingStatus(true);
              }}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
            >
              Change status →
            </button>
          ))}
        {statusError && <p className="mt-1 text-xs text-red-600">{statusError}</p>}
      </section>

      <section className={SECTION_CLASSES}>
        <p className={LABEL_CLASSES}>Received</p>
        <p className={VALUE_CLASSES}>{formatDate(job.receivedDate)}</p>
      </section>

      {job.promisedDate && (
        <section className={SECTION_CLASSES}>
          <p className={LABEL_CLASSES}>Promised</p>
          <p
            className={`text-sm font-medium ${isPromisedOverdue ? 'text-red-600' : 'text-gray-900'}`}
          >
            {formatDate(job.promisedDate)}
            {isPromisedOverdue && <span className="ml-1 text-xs font-semibold">⚠ overdue</span>}
          </p>
        </section>
      )}

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
