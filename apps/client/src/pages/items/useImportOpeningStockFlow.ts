import { useEffect, useRef, useState } from 'react';
import { useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import {
  countDataRows,
  parseHeaderLine,
  validateHeaders,
  type ImportState,
} from './importCsvValidation.js';

// Mirrors packages/core/src/import/item-columns.ts's OPENING_STOCK_COLUMNS
// exactly. apps/client may never import @shop/core (architecture boundary
// — see eslint.config.js), so this is a manually synced local copy, the
// same pattern ITEM_COLUMNS in useImportItemsFlow.ts already uses. If
// item-columns.ts changes, this must be updated too.
export const OPENING_STOCK_COLUMNS = [
  'Item Code',
  'Item Name (English)',
  'Count Date',
  'Quantity Counted',
  'Unit Cost (PKR)',
  'Serial Numbers',
  'Shelf / Location',
  'Counted By',
  'Notes',
];

export interface UseImportOpeningStockFlowResult {
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
 * Option B, Opening Stock (Session 52, owner decision: separate from Items
 * import — its own button, modal, and IPC channel). Same six-state
 * file-picker shape as useImportItemsFlow, validated against
 * OPENING_STOCK_COLUMNS and sent as openingStockCsv to a dedicated channel.
 */
export function useImportOpeningStockFlow(
  open: boolean,
  onClose: () => void,
  onImported: () => void,
): UseImportOpeningStockFlowResult {
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
        const errors = validateHeaders(parseHeaderLine(text), OPENING_STOCK_COLUMNS);
        if (errors.length > 0) {
          setState({ status: 'error', filename: file.name, errors });
        } else {
          setState({
            status: 'ready',
            filename: file.name,
            rowCount: countDataRows(text),
            text,
          });
        }
      })
      .catch(() => {
        setState({ status: 'error', filename: file.name, errors: ['Could not read the file.'] });
      });
  };

  const handleImportClick = (): void => {
    if (state.status !== 'ready' && state.status !== 'failed') return;
    const { filename, text } = state;
    setState({ status: 'importing', filename, text });
    ipc.importOpeningStock
      .commit({ openingStockCsv: text })
      .then((result) => {
        showToast({
          variant: 'success',
          message: `Opening stock imported: ${String(result.accepted)} rows added`,
        });
        onImported();
        onClose();
        setState({ status: 'idle' });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Opening stock import failed';
        setState({ status: 'failed', filename, text, serverError: message });
        showToast({ variant: 'error', message: 'Opening stock import failed' });
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
