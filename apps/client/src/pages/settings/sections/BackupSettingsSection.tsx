import { useState } from 'react';
import { Alert, Button, ConfirmDialog } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';

/** No Node `path` module in the sandboxed renderer — this is a plain string split. */
function fileNameOf(fullPath: string): string {
  return fullPath.split(/[/\\]/).pop() ?? fullPath;
}

/** P16-1b — relocated from BackupRestoreCard.tsx (Card wrapper stripped, logic unchanged). No form here, so no dirty-tracking — every action fires immediately, same as before. */
export function BackupSettingsSection(): React.JSX.Element {
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  function createBackup(): void {
    setBackingUp(true);
    setBackupError(null);
    setBackupMessage(null);
    ipc.backup
      .now()
      .then((result) => {
        // null = the owner cancelled the folder picker — not an error.
        if (result) setBackupMessage(`Backup created: ${fileNameOf(result.backupPath)}`);
      })
      .catch((err: unknown) => {
        setBackupError(err instanceof Error ? err.message : 'Backup failed');
      })
      .finally(() => {
        setBackingUp(false);
      });
  }

  function confirmRestore(): void {
    setConfirmRestoreOpen(false);
    setRestoring(true);
    setBackupError(null);
    setBackupMessage(null);
    ipc.backup
      .restore()
      // null = cancelled at the native file picker (the sole native
      // prompt left in this flow — see backup.handler.ts) — not an error.
      .then((result) => {
        if (result) setBackupMessage('Database restored. Restart the app to continue.');
      })
      .catch((err: unknown) => {
        setBackupError(err instanceof Error ? err.message : 'Restore failed');
      })
      .finally(() => {
        setRestoring(false);
      });
  }

  return (
    <div className="flex flex-col gap-4">
      {backupError && <Alert variant="danger">{backupError}</Alert>}
      {backupMessage && <Alert variant="success">{backupMessage}</Alert>}
      <div className="flex gap-3">
        <Button variant="secondary" disabled={backingUp} onClick={createBackup}>
          Create backup
        </Button>
        <Button
          variant="danger"
          disabled={restoring}
          onClick={() => {
            setConfirmRestoreOpen(true);
          }}
        >
          Restore from backup
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRestoreOpen}
        title="Restore from backup?"
        confirmLabel="Restore"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={confirmRestore}
        onCancel={() => {
          setConfirmRestoreOpen(false);
        }}
      >
        This will replace all current data with the backup. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
