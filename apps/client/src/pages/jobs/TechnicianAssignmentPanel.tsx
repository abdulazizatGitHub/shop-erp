import { useEffect, useState } from 'react';
import type { JobDto, TechnicianAssignmentDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export interface TechnicianAssignmentPanelProps {
  readonly job: JobDto;
  readonly technicians: ReadonlyArray<{ id: string; name: string }>;
  /** Assign (not unassign) can change job.assignedTo on a job's very
   * first assignment (P14-1) — propagated up so the rest of the job card
   * (e.g. JobPartsSection's defaultTechnicianId) stays in sync. */
  readonly onJobChanged: (updated: JobDto) => void;
}

/**
 * P14-5 — replaces the old single-technician widget (job.assignedTo-only,
 * one <Select> dropdown) with a multi-technician list backed by
 * job_technician (P14-1).
 *
 * P16-3c (OD-16-5) — read-only (both add AND remove) once the job
 * reaches status `ready`, `delivered`, or `cancelled`, derived directly
 * from job.status, no new prop; this is a UI convenience only — the
 * real lock lives in the repository (job-technician.repository.ts),
 * re-checked there regardless of what this component allows. Removing
 * a technician now requires a reason, entered inline before the removal
 * is confirmed; removed technicians stay listed below the active ones,
 * with their removal date and reason, instead of disappearing.
 */
export function TechnicianAssignmentPanel({
  job,
  technicians,
  onJobChanged,
}: TechnicianAssignmentPanelProps): React.JSX.Element {
  const [assignments, setAssignments] = useState<readonly TechnicianAssignmentDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  function load(): void {
    ipc.job
      .listTechnicianAssignments(job.id)
      .then((rows) => {
        setAssignments(rows);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load technicians');
      });
  }

  useEffect(load, [job.id]);

  const isReadOnly =
    job.status === 'ready' || job.status === 'delivered' || job.status === 'cancelled';
  const active = (assignments ?? []).filter((a) => a.unassignedAt === null);
  const removed = (assignments ?? []).filter((a) => a.unassignedAt !== null);
  const showLegacyFallback =
    assignments !== null && assignments.length === 0 && job.assignedTo !== null;
  const legacyName = technicians.find((t) => t.id === job.assignedTo)?.name ?? null;

  const activeTechnicianIds = new Set(active.map((a) => a.partyId));
  const availableToAdd = technicians.filter((t) => !activeTechnicianIds.has(t.id));

  function technicianName(partyId: string): string {
    return technicians.find((t) => t.id === partyId)?.name ?? '…';
  }

  async function handleAssign(technicianPartyId: string): Promise<void> {
    if (technicianPartyId.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await ipc.job.assignTechnician({ jobId: job.id, technicianPartyId });
      onJobChanged(updated);
      load();
      setAddingOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to assign technician');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(assignmentId: string, reason: string): Promise<void> {
    if (reason.trim().length === 0) {
      setActionError('A reason is required to remove a technician');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await ipc.job.unassignTechnician({ id: assignmentId, reason: reason.trim() });
      setRemovingId(null);
      setRemoveReason('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to unassign technician');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        Assigned Technicians
      </p>

      {loadError && <p className="text-xs text-red-600">{loadError}</p>}

      {showLegacyFallback ? (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <span className="text-gray-700">{legacyName ?? '…'} (assigned before this update)</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {active.map((a) => (
            <div key={a.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-900">
                  {technicianName(a.partyId)}{' '}
                  <span className="text-gray-400">· Assigned {formatDate(a.assignedAt)}</span>
                </span>
                {!isReadOnly && removingId !== a.id && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRemovingId(a.id);
                      setRemoveReason('');
                      setActionError(null);
                    }}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                  >
                    Unassign
                  </button>
                )}
              </div>
              {removingId === a.id && (
                <div className="mt-2 flex flex-col gap-2">
                  <input
                    type="text"
                    aria-label="Removal reason"
                    autoFocus
                    disabled={busy}
                    placeholder="Reason for removing this technician (required)"
                    value={removeReason}
                    onChange={(e) => {
                      setRemoveReason(e.target.value);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRemovingId(null);
                        setRemoveReason('');
                      }}
                      className="text-xs font-medium text-gray-500 hover:underline disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void handleUnassign(a.id, removeReason);
                      }}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                    >
                      Confirm unassign
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {active.length === 0 && assignments !== null && (
            <p className="text-sm italic text-gray-400">No technicians assigned.</p>
          )}
        </div>
      )}

      {actionError && <p className="mt-1 text-xs text-red-600">{actionError}</p>}

      {isReadOnly && (
        <p className="mt-2 text-xs text-gray-400">
          The technician list is locked — this job has reached status &quot;{job.status}&quot;.
        </p>
      )}

      {!isReadOnly &&
        (addingOpen ? (
          <select
            aria-label="Add technician"
            autoFocus
            disabled={busy}
            defaultValue=""
            onChange={(e) => {
              void handleAssign(e.target.value);
            }}
            onBlur={() => {
              setAddingOpen(false);
            }}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select…
            </option>
            {availableToAdd.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAddingOpen(true);
            }}
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            + Add technician ▾
          </button>
        ))}

      {removed.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">Removed</p>
          <div className="flex flex-col gap-1">
            {removed.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span className="text-gray-500">
                  {technicianName(a.partyId)}{' '}
                  <span className="text-gray-400">
                    · Removed {a.unassignedAt ? formatDate(a.unassignedAt) : '…'}
                  </span>
                </span>
                {a.unassignReason && (
                  <p className="mt-0.5 text-xs text-gray-400">Reason: {a.unassignReason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
