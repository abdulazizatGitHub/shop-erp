import { useState } from 'react';
import type { JobClientDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';

const LABEL_CLASSES = 'mb-1 text-xs font-medium uppercase tracking-wider text-gray-400';
const VALUE_CLASSES = 'text-sm font-medium text-gray-900';

export interface JobClientSectionProps {
  readonly jobClientId: string | null;
  readonly jobClientName: string | null;
}

/**
 * P15-5 — CLIENT section, reading job_client (P15-3) instead of the old
 * party-linked customerId/customerName. No generic Popover/Tooltip
 * primitive exists anywhere in this codebase (grepped before writing
 * this — the one hit, sales/CustomerPopover.tsx, is a bespoke
 * search-and-select widget, not a read-only detail display) and job
 * clients have no ledger page to navigate to (OD-1), so this is a
 * simple inline expansion — no floating element, no z-index management.
 * Fetches the full job_client record lazily, on click, not on job-card
 * load (jobClientId/jobClientName alone are enough for the collapsed
 * row, already denormalized onto JobDto by P15-3).
 */
export function JobClientSection({
  jobClientId,
  jobClientName,
}: JobClientSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<JobClientDto | null>(null);
  const [loading, setLoading] = useState(false);

  function handleToggle(): void {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail || !jobClientId) return;
    setLoading(true);
    ipc.jobClient
      .getById(jobClientId)
      .then(setDetail)
      .catch(() => {
        // Row just won't show further detail; the name itself already rendered.
      })
      .finally(() => {
        setLoading(false);
      });
  }

  if (!jobClientId) {
    return (
      <>
        <p className={LABEL_CLASSES}>Client</p>
        <p className="text-sm text-gray-400">No client recorded.</p>
      </>
    );
  }

  return (
    <>
      <p className={LABEL_CLASSES}>Client</p>
      <button
        type="button"
        onClick={handleToggle}
        className={`${VALUE_CLASSES} text-left underline decoration-dotted hover:text-blue-700`}
      >
        {jobClientName ?? '…'}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
          {loading && !detail ? (
            <p className="text-gray-400">Loading…</p>
          ) : detail ? (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-gray-900">{detail.name}</p>
              {(detail.phone || detail.phone2) && (
                <p className="text-gray-600">
                  {[detail.phone, detail.phone2].filter(Boolean).join(' | ')}
                </p>
              )}
              {detail.address && <p className="text-gray-600">{detail.address}</p>}
              {detail.area && <p className="text-gray-600">{detail.area}</p>}
              {detail.landmark && <p className="text-gray-600">{detail.landmark}</p>}
              {detail.notes && <p className="text-gray-500 italic">{detail.notes}</p>}
            </div>
          ) : (
            <p className="text-gray-400">Could not load client details.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
            }}
            className="mt-2 text-xs text-gray-400 underline hover:text-gray-600"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}
