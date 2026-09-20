import { useEffect, useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';

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

export interface PromisedDateFieldProps {
  readonly job: JobDto;
  readonly onJobChanged: (updated: JobDto) => void;
}

/**
 * P14-6/OD-5 — promised date is set post-creation, from here. Previously
 * read-only display, and only rendered at all when a value already
 * existed — no way to ever SET one. Now always renders, editable on
 * non-delivered/non-cancelled jobs; job:updateDiagnosis is called with
 * only promisedDate set (diagnosedFault omitted — undefined means "don't
 * touch it," see the input contract's own doc comment).
 */
export function PromisedDateField({
  job,
  onJobChanged,
}: PromisedDateFieldProps): React.JSX.Element {
  const [value, setValue] = useState(job.promisedDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(job.promisedDate ?? '');
  }, [job.id, job.promisedDate]);

  const isEditable = job.status !== 'delivered' && job.status !== 'cancelled';
  const isDirty = value !== (job.promisedDate ?? '');
  const isOverdue =
    job.promisedDate !== null && job.promisedDate < todayIso() && job.status !== 'delivered';

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const updated = await ipc.job.updateDiagnosis({
        jobId: job.id,
        promisedDate: value.length > 0 ? value : null,
      });
      onJobChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save promised date');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">Promised</p>
      {isEditable ? (
        <>
          <input
            type="date"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          {isDirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void handleSave();
              }}
              className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save
            </button>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </>
      ) : job.promisedDate ? (
        <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
          {formatDate(job.promisedDate)}
          {isOverdue && <span className="ml-1 text-xs font-semibold">⚠ overdue</span>}
        </p>
      ) : (
        <p className="text-sm text-gray-400">—</p>
      )}
    </div>
  );
}
