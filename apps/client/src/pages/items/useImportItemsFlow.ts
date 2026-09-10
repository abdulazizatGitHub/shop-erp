import { useEffect, useRef, useState } from 'react';
import { useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

// Mirrors packages/core/src/import/item-columns.ts's ITEM_COLUMNS exactly.
// apps/client may never import @shop/core (architecture boundary — see
// eslint.config.js), so this is a manually synced local copy, the same
// pattern SuppliersImportPage/CustomersImportPage already use for their own
// column instructions. If item-columns.ts changes, this must be updated too.
export const ITEM_COLUMNS = [
  'Item Code',
  'Item Name (English)',
  'Item Name (Urdu)',
  'Owning Business Unit',
  'Category',
  'Brand / Company',
  'Variant / Spec',
  'Selling Unit',
  'Purchase Unit',
  'Units per Purchase Unit',
  'Track Stock? (Y/N)',
  'Has Serial No? (Y/N)',
  'Purchase Price (PKR)',
  'Retail Price (PKR)',
  'Wholesale Price (PKR)',
  'Low Stock Alert Qty',
  'Shelf / Location',
  'Notes',
  'Alt Unit',
  'Alt Factor',
];

export type ImportState =
  | { readonly status: 'idle' }
  | { readonly status: 'validating'; readonly filename: string }
  | {
      readonly status: 'ready';
      readonly filename: string;
      readonly rowCount: number;
      readonly itemsText: string;
    }
  | { readonly status: 'error'; readonly filename: string; readonly errors: readonly string[] }
  | { readonly status: 'importing'; readonly filename: string; readonly itemsText: string }
  | {
      readonly status: 'failed';
      readonly filename: string;
      readonly itemsText: string;
      readonly serverError: string;
    };

/** First line only — a full parseCsv (quoted-cell-aware) lives in @shop/core, which
 * apps/client cannot import; header cells in this template never contain commas. */
function parseHeaderLine(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  return firstLine.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'));
}

function countDataRows(text: string): number {
  return text.split(/\r?\n/).filter((line, index) => index > 0 && line.trim().length > 0).length;
}

function validateHeaders(headers: readonly string[]): string[] {
  const errors: string[] = [];
  const missing = ITEM_COLUMNS.filter((col) => !headers.includes(col));
  const extra = headers.filter((h) => h.length > 0 && !ITEM_COLUMNS.includes(h));
  if (missing.length > 0) errors.push(`Missing columns: ${missing.join(', ')}`);
  if (extra.length > 0) errors.push(`Unexpected columns: ${extra.join(', ')}`);
  return errors;
}

export interface UseImportItemsFlowResult {
  readonly state: ImportState;
  readonly fileInputRef: React.RefObject<HTMLInputElement>;
  readonly importDisabled: boolean;
  readonly handleSelectClick: () => void;
  readonly handleSelectDifferent: () => void;
  readonly handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleImportClick: () => void;
  readonly handleModalClose: () => void;
}

/**
 * Option B (2026-09-10): the renderer reads the Items CSV via the browser
 * File API, validates its header row client-side, then sends the full file
 * content over IPC — the main process no longer opens a native file dialog.
 * Opening Stock CSV import is out of scope for this session (owner
 * decision) — see PROJECT.md's follow-up note.
 */
export function useImportItemsFlow(
  open: boolean,
  onClose: () => void,
  onImported: () => void,
): UseImportItemsFlowResult {
  const { showToast } = useToast();
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setState({ status: 'idle' });
  }, [open]);

  const handleSelectClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleSelectDifferent = (): void => {
    setState({ status: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    setState({ status: 'validating', filename: file.name });
    file
      .text()
      .then((text) => {
        const errors = validateHeaders(parseHeaderLine(text));
        if (errors.length > 0) {
          setState({ status: 'error', filename: file.name, errors });
        } else {
          setState({
            status: 'ready',
            filename: file.name,
            rowCount: countDataRows(text),
            itemsText: text,
          });
        }
      })
      .catch(() => {
        setState({ status: 'error', filename: file.name, errors: ['Could not read the file.'] });
      });
  };

  const handleImportClick = (): void => {
    if (state.status !== 'ready' && state.status !== 'failed') return;
    const { filename, itemsText } = state;
    setState({ status: 'importing', filename, itemsText });
    ipc.importData
      .commit({ itemsCsv: itemsText })
      .then((result) => {
        const parts = [`${String(result.itemsAccepted)} added`];
        if (result.itemsRejected > 0) parts.push(`${String(result.itemsRejected)} rejected`);
        parts.push(`${String(result.itemsSkipped)} skipped`);
        showToast({ variant: 'success', message: `Imported: ${parts.join(', ')}` });
        onImported();
        onClose();
        setState({ status: 'idle' });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Import failed';
        setState({ status: 'failed', filename, itemsText, serverError: message });
        showToast({ variant: 'error', message: 'Import failed — no data saved' });
      });
  };

  const handleModalClose = (): void => {
    if (state.status === 'importing') return;
    setState({ status: 'idle' });
    onClose();
  };

  return {
    state,
    fileInputRef,
    importDisabled: state.status !== 'ready' && state.status !== 'failed',
    handleSelectClick,
    handleSelectDifferent,
    handleFileChange,
    handleImportClick,
    handleModalClose,
  };
}
