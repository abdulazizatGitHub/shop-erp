import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

/** Extracted out of SettingsPage.tsx to keep it under the 300-line file cap. */
export function ShopIdentityCard(): React.JSX.Element {
  const [shopName, setShopNameValue] = useState<string | null>(null);
  const [shopNameDraft, setShopNameDraft] = useState('');
  const [shopNameError, setShopNameError] = useState<string | null>(null);
  const [shopNameMessage, setShopNameMessage] = useState<string | null>(null);
  const [savingShopName, setSavingShopName] = useState(false);

  useEffect(() => {
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

  return (
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
  );
}
