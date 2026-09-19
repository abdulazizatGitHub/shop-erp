import { useEffect, useRef, useState } from 'react';
import { useToast } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import {
  countDataRows,
  parseHeaderLine,
  validateHeaders,
  type ImportState,
} from '../items/importCsvValidation.js';

// Mirrors packages/core/src/import/customer-columns.ts's
// CUSTOMER_BALANCE_COLUMNS exactly — apps/client may never import
// @shop/core (architecture boundary), same manually synced local copy
// pattern useImportSupplierBalanceFlow.ts already uses.
export const CUSTOMER_BALANCE_COLUMNS = [
  'Customer Name',
  'Phone',
  'Bill Reference',
  'Bill Date',
  'Original Amount (PKR)',
  'Amount Paid So Far (PKR)',
  'Notes',
];

export interface UseImportCustomerBalanceFlowResult {
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
 * CL-10. Option B conversion — single-file six-state shape, same as
 * useImportSupplierBalanceFlow.ts, validated against
 * CUSTOMER_BALANCE_COLUMNS and sent as balancesCsv to
 * ipc.importCustomerBalance.
 */
export function useImportCustomerBalanceFlow(
  open: boolean,
  onClose: () => void,
  onImported: () => void,
): UseImportCustomerBalanceFlowResult {
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
        const errors = validateHeaders(parseHeaderLine(text), CUSTOMER_BALANCE_COLUMNS);
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
    ipc.importCustomerBalance
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
