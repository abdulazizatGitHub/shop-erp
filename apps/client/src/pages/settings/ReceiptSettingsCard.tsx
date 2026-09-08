import { useEffect, useState } from 'react';
import type { ReceiptPaperSize } from '../../types/electron-api.js';
import { Alert, Button, Card } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

/** Extracted out of SettingsPage.tsx to keep it under the 300-line file cap. */
export function ReceiptSettingsCard(): React.JSX.Element {
  const [paperSize, setPaperSize] = useState<ReceiptPaperSize | null>(null);
  const [savingPaperSize, setSavingPaperSize] = useState(false);
  const [paperSizeError, setPaperSizeError] = useState<string | null>(null);

  useEffect(() => {
    ipc.setting
      .getReceiptPaperSize()
      .then(setPaperSize)
      .catch((err: unknown) => {
        setPaperSizeError(err instanceof Error ? err.message : 'Failed to load settings');
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

  return (
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
  );
}
