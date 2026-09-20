import { useEffect, useState } from 'react';
import type { JobDto, JobStatusHistoryDto, TechnicianAssignmentDto } from '@shop/contracts';
import type { JobPartRecord } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';
import { buildHistoryEvents, formatEventTimestamp } from './job-history-events.js';

export interface JobActivitySectionProps {
  readonly job: JobDto;
  readonly parts: readonly JobPartRecord[] | null;
  readonly technicianNames: Record<string, string>;
}

/**
 * "History" — P14-8. Read-only. Fetches the two reads that don't already
 * exist at this level (job_status_history, job_technician's full list —
 * TechnicianAssignmentPanel.tsx already calls listTechnicianAssignments,
 * but that's a separate component instance/fetch); parts and the job
 * itself are already fetched by JobDetailPage.tsx and passed down. Event
 * construction is pure and lives in job-history-events.ts, unit-tested
 * there independent of this component.
 */
export function JobActivitySection({
  job,
  parts,
  technicianNames,
}: JobActivitySectionProps): React.JSX.Element {
  const [statusHistory, setStatusHistory] = useState<readonly JobStatusHistoryDto[] | null>(null);
  const [technicianAssignments, setTechnicianAssignments] = useState<
    readonly TechnicianAssignmentDto[] | null
  >(null);

  useEffect(() => {
    ipc.job
      .listStatusHistory(job.id)
      .then(setStatusHistory)
      .catch(() => {
        setStatusHistory([]);
      });
    ipc.job
      .listTechnicianAssignments(job.id)
      .then(setTechnicianAssignments)
      .catch(() => {
        setTechnicianAssignments([]);
      });
  }, [job.id]);

  const events =
    statusHistory !== null && technicianAssignments !== null && parts !== null
      ? buildHistoryEvents({
          job,
          parts,
          statusHistory,
          technicianAssignments,
          technicianNames,
        })
      : [];

  return (
    <section>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">History</p>
      {events.length === 0 ? (
        <p className="text-sm text-gray-400">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.map((event, index) => (
            <li key={index} className="flex items-baseline gap-2">
              <span className="shrink-0 text-xs text-gray-400">
                {formatEventTimestamp(event.timestamp)}
              </span>
              <span className="text-sm text-gray-600">{event.description}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
