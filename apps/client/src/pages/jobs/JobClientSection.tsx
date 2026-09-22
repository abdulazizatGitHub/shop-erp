import { useState } from 'react';
import type { JobClientDto, JobDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';
import { JobClientPicker } from './JobClientPicker.js';

const LABEL_CLASSES = 'mb-1 text-xs font-medium uppercase tracking-wider text-gray-400';
const VALUE_CLASSES = 'text-sm font-medium text-gray-900';

export interface JobClientSectionProps {
  readonly job: JobDto;
  readonly onJobChanged: (updated: JobDto) => void;
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
 *
 * I4/BUG-17 (partial) — when no client is linked yet, an editable job
 * can link an EXISTING client via JobClientPicker (same intake
 * component, reused inline — not the full JobCreateForm). Creating a
 * brand-new client through this inline flow, and changing an
 * already-linked client, are both explicitly out of scope (logged as a
 * future item) — the picker's own "Create new client" row is a no-op
 * here, same as it always was before an explicit selection.
 */
export function JobClientSection({ job, onJobChanged }: JobClientSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<JobClientDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditable = job.status !== 'delivered' && job.status !== 'cancelled';

  function handleToggle(): void {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail || !job.jobClientId) return;
    setLoading(true);
    ipc.jobClient
      .getById(job.jobClientId)
      .then(setDetail)
      .catch(() => {
        // Row just won't show further detail; the name itself already rendered.
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function handleLink(client: JobClientDto): Promise<void> {
    setSaving(true);
    setLinkError(null);
    try {
      const updated = await ipc.job.updateDetails({ jobId: job.id, jobClientId: client.id });
      onJobChanged(updated);
      setLinking(false);
      setLinkName('');
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to link client');
    } finally {
      setSaving(false);
    }
  }

  if (!job.jobClientId) {
    return (
      <>
        <p className={LABEL_CLASSES}>Client</p>
        {linking ? (
          <div className="flex flex-col gap-2">
            <JobClientPicker
              name={linkName}
              onNameChange={setLinkName}
              selected={null}
              onSelect={(client) => {
                void handleLink(client);
              }}
              onClearSelection={() => {
                setLinkName('');
              }}
            />
            {saving && <p className="text-xs text-gray-400">Linking…</p>}
            {linkError && <p className="text-xs text-red-600">{linkError}</p>}
            <button
              type="button"
              className="text-xs text-gray-400 underline hover:text-gray-600"
              onClick={() => {
                setLinking(false);
                setLinkName('');
                setLinkError(null);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <p className="mb-1 text-sm text-gray-400">No client recorded.</p>
            {isEditable && (
              <button
                type="button"
                className="text-xs text-blue-600 underline hover:text-blue-800"
                onClick={() => {
                  setLinking(true);
                }}
              >
                Link client
              </button>
            )}
          </>
        )}
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
        {job.jobClientName ?? '…'}
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
