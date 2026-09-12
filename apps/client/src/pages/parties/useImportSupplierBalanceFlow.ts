import { useEffect, useRef, useState } from 'react';
import { useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import {
  countDataRows,
  parseHeaderLine,
  validateHeaders,
  type ImportState,
} from '../items/importCsvValidation.js';

// Mirrors packages/core/src/import/supplier-columns.ts's
// SUPPLIER_BALANCE_COLUMNS exactly — apps/client may never import
// @shop/core (architecture boundary), so this is a manually synced local
// copy, the same pattern OPENING_STOCK_COLUMNS in useImportOpeningStockFlow.ts
// already uses. If supplier-columns.ts changes, this must be updated too.
export const SUPPLIER_BALANCE_COLUMNS = [
  'Supplier Name',
  'Phone',
  'Bill Reference',
  'Bill Date',
  'Original Amount (PKR)',
  'Amount Paid So Far (PKR)',
  'Due Date',
  'Notes',
];

export interface UseImportSupplierBalanceFlowResult {
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
 * Option B conversion (Suppliers redesign session): single-file six-state
 * shape, same as useImportOpeningStockFlow.ts, validated against
 * SUPPLIER_BALANCE_COLUMNS and sent as balancesCsv to
 * ipc.importSupplierBalance.
 */
export function useImportSupplierBalanceFlow(
  open: boolean,
  onClose: () => void,
  onImported: () => void,
): UseImportSupplierBalanceFlowResult {
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
        const errors = validateHeaders(parseHeaderLine(text), SUPPLIER_BALANCE_COLUMNS);
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
    ipc.importSupplierBalance
      .commit({ balancesCsv: text })
      .then((result) => {
        showToast({
          variant: 'success',
          message: `Balances imported: ${String(result.accepted)} accepted, ${String(result.skipped)} skipped`,
        });
        onImported();
        onClose();
        setState({ status: 'idle' });
      })
      .catch(() => {
        setState({ status: 'failed', filename, text, serverError: 'Import failed' });
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
