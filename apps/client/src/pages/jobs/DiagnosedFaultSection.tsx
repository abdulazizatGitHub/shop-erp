import { useEffect, useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { Button } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { diagnosisSavedTransitionTarget } from './job-status-machine.js';

export interface DiagnosedFaultSectionProps {
  readonly job: JobDto;
  readonly onJobChanged: (updated: JobDto) => void;
}

/**
 * P14-6 — reported fault (read-only, always) + diagnosed fault (editable
 * textarea, non-delivered/non-cancelled jobs only). Save calls
 * job:updateDiagnosis, then — per P14-3's already-built, canTransition-gated
 * trigger — job:transitionStatus if diagnosisSavedTransitionTarget says so.
 */
export function DiagnosedFaultSection({
  job,
  onJobChanged,
}: DiagnosedFaultSectionProps): React.JSX.Element {
  const [value, setValue] = useState(job.diagnosedFault ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(job.diagnosedFault ?? '');
  }, [job.id, job.diagnosedFault]);

  const isEditable = job.status !== 'delivered' && job.status !== 'cancelled';
  const isDirty = value !== (job.diagnosedFault ?? '');

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const trimmed = value.trim();
      const updated = await ipc.job.updateDiagnosis({
        jobId: job.id,
        diagnosedFault: trimmed.length > 0 ? trimmed : null,
      });
      const target = diagnosisSavedTransitionTarget(updated.status);
      const finalJob = target
        ? await ipc.job.transitionStatus({ jobId: job.id, toStatus: target, note: null })
        : updated;
      onJobChanged(finalJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save diagnosis');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Reported fault
      </p>
      <p className="mb-4 text-sm text-gray-700">{job.reportedFault ?? '—'}</p>

      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Diagnosed fault
      </p>
      {isEditable ? (
        <>
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
            placeholder="Enter technician's diagnosis…"
            rows={3}
            className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500"
          />
          {isDirty && (
            <div className="mt-2">
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => {
                  void handleSave();
                }}
              >
                Save diagnosis
              </Button>
            </div>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </>
      ) : (
        <p className="text-sm text-gray-700">{job.diagnosedFault ?? '—'}</p>
      )}
    </section>
  );
}
