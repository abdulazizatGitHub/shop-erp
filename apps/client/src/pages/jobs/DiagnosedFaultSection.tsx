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

  const [faultValue, setFaultValue] = useState(job.reportedFault ?? '');
  const [faultSaving, setFaultSaving] = useState(false);
  const [faultError, setFaultError] = useState<string | null>(null);

  useEffect(() => {
    setValue(job.diagnosedFault ?? '');
    setFaultValue(job.reportedFault ?? '');
  }, [job.id, job.diagnosedFault, job.reportedFault]);

  const isEditable = job.status !== 'delivered' && job.status !== 'cancelled';
  const isDirty = value !== (job.diagnosedFault ?? '');
  const isFaultDirty = faultValue !== (job.reportedFault ?? '');

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

  /** I4/BUG-17 (partial) — reportedFault is now editable too, same
   * dirty/Save pattern as diagnosedFault above, but through
   * job:updateDetails (no status-transition side effect). */
  async function handleSaveFault(): Promise<void> {
    setFaultSaving(true);
    setFaultError(null);
    try {
      const trimmed = faultValue.trim();
      const updated = await ipc.job.updateDetails({
        jobId: job.id,
        reportedFault: trimmed.length > 0 ? trimmed : null,
      });
      onJobChanged(updated);
    } catch (err) {
      setFaultError(err instanceof Error ? err.message : 'Failed to save reported fault');
    } finally {
      setFaultSaving(false);
    }
  }

  return (
    <section>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Reported fault
      </p>
      {isEditable ? (
        <>
          <textarea
            value={faultValue}
            onChange={(e) => {
              setFaultValue(e.target.value);
            }}
            rows={2}
            className="mb-4 w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-blue-500"
          />
          {isFaultDirty && (
            <div className="-mt-3 mb-4 flex items-center gap-3">
              <Button
                variant="primary"
                disabled={faultSaving}
                onClick={() => {
                  void handleSaveFault();
                }}
              >
                Save
              </Button>
              <button
                type="button"
                className="text-xs text-gray-400 underline hover:text-gray-600"
                onClick={() => {
                  setFaultValue(job.reportedFault ?? '');
                  setFaultError(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {faultError && <p className="-mt-3 mb-4 text-xs text-red-600">{faultError}</p>}
        </>
      ) : (
        <p className="mb-4 text-sm text-gray-700">{job.reportedFault ?? '—'}</p>
      )}

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
            <div className="mt-2 flex items-center gap-3">
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => {
                  void handleSave();
                }}
              >
                Save diagnosis
              </Button>
              <button
                type="button"
                className="text-xs text-gray-400 underline hover:text-gray-600"
                onClick={() => {
                  setValue(job.diagnosedFault ?? '');
                  setError(null);
                }}
              >
                Cancel
              </button>
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
