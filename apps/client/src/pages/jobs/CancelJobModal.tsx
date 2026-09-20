import { useState } from 'react';
import type { CancellationReason, JobDto } from '@shop/contracts';
import { Alert, Button, Modal, Select } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { CANCELLATION_REASON_LABELS } from './cancellation-reason-labels.js';

const REASONS = Object.keys(CANCELLATION_REASON_LABELS) as CancellationReason[];

export interface CancelJobModalProps {
  readonly open: boolean;
  readonly job: JobDto;
  readonly onClose: () => void;
  readonly onCancelled: (updated: JobDto) => void;
}

/** P14-4 — OD-2: reason is a required dropdown from a fixed list, notes
 * optional. role="alertdialog" — this is a real, hard-to-undo decision
 * (matches Modal's own doc comment on when to use that role). */
export function CancelJobModal({
  open,
  job,
  onClose,
  onCancelled,
}: CancelJobModalProps): React.JSX.Element {
  const [reason, setReason] = useState<CancellationReason | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    if (reason === '') {
      setError('Select a cancellation reason');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await ipc.job.cancelJob({
        jobId: job.id,
        reason,
        notes: notes.trim().length > 0 ? notes.trim() : null,
      });
      onCancelled(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Cancel job" onClose={onClose} role="alertdialog">
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        <Select
          label="Reason"
          required
          autoFocus
          value={reason}
          onChange={(e) => {
            setReason(e.target.value as CancellationReason);
          }}
        >
          <option value="" disabled>
            Select a reason…
          </option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {CANCELLATION_REASON_LABELS[r]}
            </option>
          ))}
        </Select>

        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
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
            variant="danger"
            disabled={submitting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            Confirm cancellation
          </Button>
        </div>
      </div>
    </Modal>
  );
}
