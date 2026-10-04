import { useRef, useState } from 'react';
import { useToast } from '@shop/ui';
import type { ReceiptPaperSize } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';
import { ITEM_COLUMNS } from '../items/useImportItemsFlow.js';
import {
  countDataRows,
  parseHeaderLine,
  validateHeaders,
  type ImportState,
} from '../items/importCsvValidation.js';

export interface SetupWizardForm {
  readonly shopName: string;
  readonly ownerName: string;
  readonly paperSize: ReceiptPaperSize;
}

export interface UseSetupWizardResult {
  readonly form: SetupWizardForm;
  readonly setShopName: (value: string) => void;
  readonly setOwnerName: (value: string) => void;
  readonly setPaperSize: (value: ReceiptPaperSize) => void;
  readonly csvState: ImportState;
  readonly fileInputRef: React.RefObject<HTMLInputElement>;
  readonly handleSelectClick: () => void;
  readonly handleSelectDifferent: () => void;
  readonly handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly canFinish: boolean;
  readonly submitting: boolean;
  readonly submitError: string | null;
  readonly handleFinish: () => void;
}

/**
 * Phase 18, first-run setup wizard (AppRoot.tsx renders this instead of
 * App.tsx when `setup:status` reports no tenant row). The CSV step
 * reuses useImportItemsFlow's own column list and pure header-check
 * functions verbatim — "same validation" per the owner's instruction —
 * but, unlike that hook, never calls ipc.importData.commit itself: the
 * raw CSV text is held here and sent as part of the one setup:finish
 * call instead, since the business units/uoms/etc. the import's lookups
 * resolve against do not exist until that call's own seed() step runs
 * (tenant_id foreign keys — the tenant row does not exist before
 * Finish either). See setup.handler.ts's own header comment for the
 * full ordering rationale.
 */
export function useSetupWizard(onComplete: () => void): UseSetupWizardResult {
  const { showToast } = useToast();
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [paperSize, setPaperSize] = useState<ReceiptPaperSize>('A4');
  const [csvState, setCsvState] = useState<ImportState>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleSelectDifferent = (): void => {
    setCsvState({ status: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvState({ status: 'validating', filename: file.name });
    file
      .text()
      .then((text) => {
        const errors = validateHeaders(parseHeaderLine(text), ITEM_COLUMNS);
        if (errors.length > 0) {
          setCsvState({ status: 'error', filename: file.name, errors });
        } else {
          setCsvState({
            status: 'ready',
            filename: file.name,
            rowCount: countDataRows(text),
            text,
          });
        }
      })
      .catch(() => {
        setCsvState({ status: 'error', filename: file.name, errors: ['Could not read the file.'] });
      });
  };

  const canFinish =
    shopName.trim().length > 0 &&
    ownerName.trim().length > 0 &&
    !submitting &&
    csvState.status !== 'validating';

  function handleFinish(): void {
    if (!canFinish) return;
    setSubmitting(true);
    setSubmitError(null);
    ipc.setup
      .finish({
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        paperSize,
        ...(csvState.status === 'ready' ? { itemsCsv: csvState.text } : {}),
      })
      .then((result) => {
        // Edge case, owner's explicit instruction: CSV import errors
        // must not block setup completion — only inform, then proceed.
        // "Re-import later from the Items screen" matches
        // useImportItemsFlow's own retry path (ImportItemsModal).
        if (result.itemsImportError) {
          showToast({
            variant: 'warning',
            message: `Setup complete, but the item import failed: ${result.itemsImportError}. You can import items later from the Items screen.`,
          });
        } else if (result.itemsImport) {
          const { itemsAccepted, itemsRejected, itemsSkipped } = result.itemsImport;
          const parts = [`${String(itemsAccepted)} imported`];
          if (itemsRejected > 0) parts.push(`${String(itemsRejected)} rejected`);
          if (itemsSkipped > 0) parts.push(`${String(itemsSkipped)} skipped`);
          showToast({
            variant: itemsRejected > 0 ? 'warning' : 'success',
            message: `Setup complete. Items: ${parts.join(', ')} — see the Items screen to re-import any skipped rows.`,
          });
        } else {
          showToast({ variant: 'success', message: 'Setup complete.' });
        }
        onComplete();
      })
      .catch((err: unknown) => {
        setSubmitting(false);
        setSubmitError(err instanceof Error ? err.message : 'Setup failed');
      });
  }

  return {
    form: { shopName, ownerName, paperSize },
    setShopName,
    setOwnerName,
    setPaperSize,
    csvState,
    fileInputRef,
    handleSelectClick,
    handleSelectDifferent,
    handleFileChange,
    canFinish,
    submitting,
    submitError,
    handleFinish,
  };
}
