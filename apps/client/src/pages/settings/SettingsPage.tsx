import { useEffect, useState } from 'react';
import type { ReceiptPaperSize } from '../../types/electron-api.js';
import { Alert, Button, Card, ConfirmDialog, PageHeader, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

/** No Node `path` module in the sandboxed renderer — this is a plain string split. */
function fileNameOf(fullPath: string): string {
  return fullPath.split(/[/\\]/).pop() ?? fullPath;
}

export function SettingsPage(): React.JSX.Element {
  const [paperSize, setPaperSize] = useState<ReceiptPaperSize | null>(null);
  const [shopName, setShopNameValue] = useState<string | null>(null);
  const [shopNameDraft, setShopNameDraft] = useState('');
  const [shopNameError, setShopNameError] = useState<string | null>(null);
  const [shopNameMessage, setShopNameMessage] = useState<string | null>(null);
  const [savingShopName, setSavingShopName] = useState(false);
  const [savingPaperSize, setSavingPaperSize] = useState(false);
  const [paperSizeError, setPaperSizeError] = useState<string | null>(null);

  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  useEffect(() => {
    ipc.setting
      .getReceiptPaperSize()
      .then(setPaperSize)
      .catch((err: unknown) => {
        setPaperSizeError(err instanceof Error ? err.message : 'Failed to load settings');
      });

    ipc.setting
      .getShopName()
      .then((value) => {
        setShopNameValue(value);
        setShopNameDraft(value);
      })
      .catch((err: unknown) => {
        setShopNameError(err instanceof Error ? err.message : 'Failed to load settings');
      });
  }, []);

  function changePaperSize(value: ReceiptPaperSize): void {
    setSavingPaperSize(true);
    ipc.setting
      .setReceiptPaperSize({ value })
      .then(() => {
        setPaperSize(value);
        setPaperSizeError(null);
      })
      .catch((err: unknown) => {
        setPaperSizeError(err instanceof Error ? err.message : 'Failed to save setting');
      })
      .finally(() => {
        setSavingPaperSize(false);
      });
  }

  function saveShopName(): void {
    const trimmed = shopNameDraft.trim();
    if (trimmed.length === 0) {
      setShopNameError('Shop name cannot be blank');
      return;
    }
    setSavingShopName(true);
    setShopNameMessage(null);
    ipc.setting
      .setShopName({ value: trimmed })
      .then(() => {
        setShopNameValue(trimmed);
        setShopNameDraft(trimmed);
        setShopNameError(null);
        setShopNameMessage('Shop name saved.');
      })
      .catch((err: unknown) => {
        setShopNameError(err instanceof Error ? err.message : 'Failed to save setting');
      })
      .finally(() => {
        setSavingShopName(false);
      });
  }

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
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <Card title="Shop identity">
        {shopNameError && <Alert variant="danger">{shopNameError}</Alert>}
        {shopNameMessage && <Alert variant="success">{shopNameMessage}</Alert>}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <TextInput
              label="Shop name (printed on every receipt)"
              value={shopNameDraft}
              disabled={shopName === null || savingShopName}
              onChange={(e) => {
                setShopNameDraft(e.target.value);
              }}
            />
          </div>
          <Button
            variant="primary"
            disabled={shopNameDraft.trim() === shopName || savingShopName}
            onClick={saveShopName}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card title="Receipt settings">
        {paperSizeError && <Alert variant="danger">{paperSizeError}</Alert>}
        <p className="mb-2 text-sm font-medium text-ink-muted">Receipt paper size</p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={paperSize === 'A4' ? 'primary' : 'secondary'}
            size="large"
            disabled={paperSize === null || savingPaperSize}
            onClick={() => {
              changePaperSize('A4');
            }}
          >
            A4
          </Button>
          <Button
            variant={paperSize === 'A5' ? 'primary' : 'secondary'}
            size="large"
            disabled={paperSize === null || savingPaperSize}
            onClick={() => {
              changePaperSize('A5');
            }}
          >
            A5
          </Button>
        </div>
      </Card>

      <Card title="Backup and restore">
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
      </Card>

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
