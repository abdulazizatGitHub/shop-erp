import { useState } from 'react';
import { Alert, Button, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

interface ClosedSessionNoteProps {
  readonly sessionId: string;
  readonly note: string | null;
  readonly onSaved: (note: string) => void;
}

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), review round 7 follow-up. The
 * refusal message shown when a cash movement can no longer be reversed
 * ("That day is closed... Add a note to the closed session instead")
 * points here — a closed session's only recourse for a data-entry
 * mistake. `cash_session.notes` is a plain, non-append-only column
 * (PHASE_7.md §5 Correction 2): a second save replaces the note, there
 * is no history of prior ones.
 */
export function ClosedSessionNote({
  sessionId,
  note,
  onSaved,
}: ClosedSessionNoteProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [noteInput, setNoteInput] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave(): Promise<void> {
    setError(null);
    if (noteInput.trim().length === 0) {
      setError('A note is required.');
      return;
    }
    setBusy(true);
    try {
      const result = await ipc.cashSession.setNote({ sessionId, note: noteInput.trim() });
      onSaved(result.notes ?? '');
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        {error && <Alert variant="danger">{error}</Alert>}
        {note && <p className="text-sm text-ink-muted">{note}</p>}
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setNoteInput(note ?? '');
              setEditing(true);
            }}
          >
            {note ? 'Edit note' : 'Add note'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert variant="danger">{error}</Alert>}
      <TextInput
        label="Note"
        autoFocus
        value={noteInput}
        onChange={(e) => {
          setNoteInput(e.target.value);
        }}
      />
      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={busy || noteInput.trim().length === 0}
          onClick={() => {
            void handleSave();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
