import { useEffect, useState } from 'react';
import type { ShopIdentityDto } from '@shop/contracts';
import type { ReceiptPaperSize } from '../../../types/electron-api.js';
import { Alert, Button, TextInput } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { blankToNull } from '../formHelpers.js';
import { useSettingsDirty } from '../SettingsDirtyContext.js';
import { useSectionActions } from '../SettingsSectionFrame.js';

interface FormState {
  readonly invoiceHeaderText: string;
  readonly invoiceFooterText: string;
  readonly statementFooterText: string;
  readonly paperSize: ReceiptPaperSize;
}

function toForm(identity: ShopIdentityDto, paperSize: ReceiptPaperSize): FormState {
  return {
    invoiceHeaderText: identity.invoiceHeaderText ?? '',
    invoiceFooterText: identity.invoiceFooterText ?? '',
    statementFooterText: identity.statementFooterText ?? '',
    paperSize,
  };
}

/**
 * P16-1b — merges ShopIdentityCard.tsx's invoice/statement text fields
 * with ReceiptSettingsCard.tsx's paper size into ONE section with ONE
 * Save. Paper size used to save instantly on click (ReceiptSettingsCard's
 * changePaperSize) — that's retired here; it is now a plain form field,
 * part of dirty tracking, sent only on Save (owner correction — instant
 * and explicit save must not coexist in one section).
 *
 * Save calls the same two existing IPC methods in sequence
 * (setShopIdentity, setReceiptPaperSize) — no new bundling logic beyond
 * that. Either can fail independently; the error names which part failed
 * and that part's fields stay dirty (the other half's `saved` snapshot is
 * advanced to match what was actually written). Same fresh-fetch-then-
 * overlay pattern as ShopSettingsSection for the identity half.
 */
export function InvoiceReceiptsSettingsSection(): React.JSX.Element {
  const { setDirty } = useSettingsDirty();
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([ipc.setting.getShopIdentity(), ipc.setting.getReceiptPaperSize()])
      .then(([identity, paperSize]) => {
        const loaded = toForm(identity, paperSize);
        setSaved(loaded);
        setForm(loaded);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      });
  }, []);

  const loading = form === null;
  const dirty = form !== null && saved !== null && JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  function update(field: keyof Omit<FormState, 'paperSize'>, value: string): void {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function setPaperSize(paperSize: ReceiptPaperSize): void {
    setForm((prev) => (prev ? { ...prev, paperSize } : prev));
  }

  async function save(): Promise<void> {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    let identityFailed = false;
    let paperSizeFailed = false;

    try {
      const current = await ipc.setting.getShopIdentity();
      await ipc.setting.setShopIdentity({
        shopName: current.shopName,
        shopPhone: current.shopPhone,
        shopAddress: current.shopAddress,
        shopEmail: current.shopEmail,
        invoiceHeaderText: blankToNull(form.invoiceHeaderText),
        invoiceFooterText: blankToNull(form.invoiceFooterText),
        statementFooterText: blankToNull(form.statementFooterText),
      });
    } catch {
      identityFailed = true;
    }

    try {
      await ipc.setting.setReceiptPaperSize({ value: form.paperSize });
    } catch {
      paperSizeFailed = true;
    }

    setSaving(false);

    if (identityFailed && paperSizeFailed) {
      setError('Failed to save invoice/receipt text and paper size.');
      return;
    }
    if (identityFailed) {
      setError('Failed to save invoice/receipt text — paper size was saved.');
      setSaved((prev) => (prev ? { ...prev, paperSize: form.paperSize } : prev));
      return;
    }
    if (paperSizeFailed) {
      setError('Failed to save paper size — invoice/receipt text was saved.');
      setSaved((prev) =>
        prev
          ? {
              ...prev,
              invoiceHeaderText: form.invoiceHeaderText,
              invoiceFooterText: form.invoiceFooterText,
              statementFooterText: form.statementFooterText,
            }
          : prev,
      );
      return;
    }

    setSaved(form);
    setMessage('Invoices & receipts settings saved.');
  }

  useSectionActions(
    <Button
      variant="primary"
      disabled={loading || saving || !dirty}
      onClick={() => {
        void save();
      }}
    >
      {saving ? 'Saving…' : 'Save'}
    </Button>,
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="Invoice header text"
          value={form?.invoiceHeaderText ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('invoiceHeaderText', e.target.value);
          }}
        />
        <TextInput
          label="Invoice footer text"
          value={form?.invoiceFooterText ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('invoiceFooterText', e.target.value);
          }}
        />
        <TextInput
          label="Statement footer text"
          value={form?.statementFooterText ?? ''}
          disabled={loading || saving}
          onChange={(e) => {
            update('statementFooterText', e.target.value);
          }}
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">Receipt paper size</p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={form?.paperSize === 'A4' ? 'primary' : 'secondary'}
            size="large"
            disabled={loading || saving}
            onClick={() => {
              setPaperSize('A4');
            }}
          >
            A4
          </Button>
          <Button
            variant={form?.paperSize === 'A5' ? 'primary' : 'secondary'}
            size="large"
            disabled={loading || saving}
            onClick={() => {
              setPaperSize('A5');
            }}
          >
            A5
          </Button>
        </div>
      </div>
    </div>
  );
}
