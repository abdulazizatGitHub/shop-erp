import { useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { Alert, Button, Modal } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const MIN_REASON_LENGTH = 10;

export interface AwaitingPartsModalProps {
  readonly open: boolean;
  readonly job: JobDto;
  readonly onClose: () => void;
  readonly onConfirmed: (updated: JobDto) => void;
}

/** P15-6/OD-6 — same Modal + confirm/cancel pattern as CancelJobModal.tsx.
 * The reason is a required free-text textarea (not a fixed-list Select
 * like cancellation), stored in job_status_history.note — the handler
 * already accepts and persists it end-to-end (confirmed by reading
 * job.handler.ts/job.service.ts/job.repository.ts before building this,
 * no changes needed there). */
export function AwaitingPartsModal({
  open,
  job,
  onClose,
  onConfirmed,
}: AwaitingPartsModalProps): React.JSX.Element {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      setError(`Reason must be at least ${MIN_REASON_LENGTH.toString()} characters`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await ipc.job.transitionStatus({
        jobId: job.id,
        toStatus: 'awaiting_parts',
        note: trimmed,
      });
      onConfirmed(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark job as awaiting parts');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Mark as Awaiting Parts" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Reason
          <textarea
            required
            autoFocus
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            placeholder="e.g. Ordered compressor from Lahore, arriving Friday"
            rows={3}
            className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-ink-muted hover:underline"
          >
            Cancel
          </button>
          <Button
            variant="primary"
            disabled={submitting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  );
}
