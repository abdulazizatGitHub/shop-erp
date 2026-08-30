import { useEffect, useState } from 'react';
import type { ReceiptPaperSize } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';

export function SettingsPage(): React.JSX.Element {
  const [paperSize, setPaperSize] = useState<ReceiptPaperSize | null>(null);
  const [shopName, setShopNameValue] = useState<string | null>(null);
  const [shopNameDraft, setShopNameDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc.setting
      .getReceiptPaperSize()
      .then((value) => {
        setPaperSize(value);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });

    ipc.setting
      .getShopName()
      .then((value) => {
        setShopNameValue(value);
        setShopNameDraft(value);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });
  }, []);

  function changePaperSize(value: ReceiptPaperSize): void {
    setSaving(true);
    ipc.setting
      .setReceiptPaperSize({ value })
      .then(() => {
        setPaperSize(value);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save setting');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function saveShopName(): void {
    const trimmed = shopNameDraft.trim();
    if (trimmed.length === 0) {
      setError('Shop name cannot be blank');
      return;
    }
    setSaving(true);
    ipc.setting
      .setShopName({ value: trimmed })
      .then(() => {
        setShopNameValue(trimmed);
        setShopNameDraft(trimmed);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save setting');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div>
      <h1>Settings</h1>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={shopName === null || saving}>
        <legend>Shop name (printed on every receipt)</legend>
        <input
          value={shopNameDraft}
          onChange={(e) => {
            setShopNameDraft(e.target.value);
          }}
        />{' '}
        <button type="button" disabled={shopNameDraft.trim() === shopName} onClick={saveShopName}>
          Save
        </button>
      </fieldset>
      <fieldset disabled={paperSize === null || saving}>
        <legend>Receipt paper size</legend>
        <label>
          <input
            type="radio"
            name="receiptPaperSize"
            value="A4"
            checked={paperSize === 'A4'}
            onChange={() => {
              changePaperSize('A4');
            }}
          />
          A4
        </label>{' '}
        <label>
          <input
            type="radio"
            name="receiptPaperSize"
            value="A5"
            checked={paperSize === 'A5'}
            onChange={() => {
              changePaperSize('A5');
            }}
          />
          A5
        </label>
      </fieldset>
    </div>
  );
}
