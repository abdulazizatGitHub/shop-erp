import { useEffect, useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { Button } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

export interface JobNotesSectionProps {
  readonly job: JobDto;
  readonly onJobChanged: (updated: JobDto) => void;
}

/** I4/BUG-17 (partial) — job.notes, editable via job:updateDetails. Same
 * always-editable + dirty-gated Save/Cancel pattern as
 * DiagnosedFaultSection.tsx (replicated, not invented). */
export function JobNotesSection({ job, onJobChanged }: JobNotesSectionProps): React.JSX.Element {
  const [value, setValue] = useState(job.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(job.notes ?? '');
  }, [job.id, job.notes]);

  const isEditable = job.status !== 'delivered' && job.status !== 'cancelled';
  const isDirty = value !== (job.notes ?? '');

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const trimmed = value.trim();
      const updated = await ipc.job.updateDetails({
        jobId: job.id,
        notes: trimmed.length > 0 ? trimmed : null,
      });
      onJobChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  }

  if (!isEditable) {
    return (
      <>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">Notes</p>
        <p className="text-sm text-gray-700">{job.notes ?? '—'}</p>
      </>
    );
  }

  return (
    <>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">Notes</p>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        rows={3}
        className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500"
      />
      {isDirty && (
        <div className="mt-2 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => {
              void handleSave();
            }}
          >
            Save
          </Button>
          <button
            type="button"
            className="text-xs text-gray-400 underline hover:text-gray-600"
            onClick={() => {
              setValue(job.notes ?? '');
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </>
  );
}
