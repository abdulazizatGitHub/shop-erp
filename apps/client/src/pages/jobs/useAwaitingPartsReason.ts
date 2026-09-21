import { useEffect, useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';

/**
 * P15-5/OD-7 — the reason shown below the status badge when a job is
 * awaiting_parts. Derived from the most recent job_status_history row
 * where toStatus='awaiting_parts' and note is set (P15-6's "Mark
 * awaiting parts" dialog writes it there). A small independent fetch
 * (JobActivitySection.tsx already fetches the same channel for the
 * History panel, but keeps that data to itself) — job:listStatusHistory
 * is a cheap plain SELECT, acceptable to call twice at this shop's
 * transaction volume (DATABASE_RULES.md §6) rather than restructuring
 * that component's self-contained fetch. Extracted out of
 * JobDetailPage.tsx (P15-6, which pushed that file to 306 lines) to
 * keep it under the project's 300-line convention.
 */
export function useAwaitingPartsReason(job: JobDto | null): string | null {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!job || job.status !== 'awaiting_parts') {
      setReason(null);
      return;
    }
    ipc.job
      .listStatusHistory(job.id)
      .then((rows) => {
        const reasonRow = rows
          .filter((r) => r.toStatus === 'awaiting_parts' && r.note !== null)
          .at(-1);
        setReason(reasonRow?.note ?? null);
      })
      .catch(() => {
        setReason(null);
      });
  }, [job?.id, job?.status]);

  return reason;
}
