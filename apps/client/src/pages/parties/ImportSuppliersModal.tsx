import { FileText } from 'lucide-react';
import { Button, ImportModal } from '@shop/ui';
import { ImportFileState } from '../items/ImportFileState.js';
import { ImportSupplierBalanceInstructions } from './ImportSupplierBalanceInstructions.js';
import {
  SUPPLIER_BALANCE_COLUMNS,
  useImportSupplierBalanceFlow,
} from './useImportSupplierBalanceFlow.js';

const SUPPLIER_BALANCE_SAMPLE_ROW = [
  'Metro Refrigeration Traders',
  '03001234567',
  'BILL-2024-001',
  '2026-01-15',
  '45000',
  '15000',
  '2026-02-15',
  'Compressor stock opening balance',
];

export interface ImportSuppliersModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful commit, so the caller can reload its supplier list. */
  readonly onImported: () => void;
}

/**
 * Option B conversion (Suppliers redesign session): same six-state
 * file-picker shell as ImportOpeningStockModal, driven by
 * useImportSupplierBalanceFlow.
 */
export function ImportSuppliersModal({
  open,
  onClose,
  onImported,
}: ImportSuppliersModalProps): React.JSX.Element | null {
  const {
    state,
    fileInputRef,
    importDisabled,
    handleSelectClick,
    handleSelectDifferent,
    handleFileChange,
    handleImportClick,
    handleModalClose,
  } = useImportSupplierBalanceFlow(open, onClose, onImported);

  return (
    <ImportModal
      open={open}
      title="Import Supplier Balances"
      onClose={handleModalClose}
      navDisabled={state.status === 'importing'}
      instructions={
        <ImportSupplierBalanceInstructions
          columns={SUPPLIER_BALANCE_COLUMNS}
          sampleRow={SUPPLIER_BALANCE_SAMPLE_ROW}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {state.status === 'idle' ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand/30 bg-surface-page px-6 py-10 text-center">
            <FileText size={40} strokeWidth={1.5} className="mb-3 text-brand/50" />
            <p className="mb-1 text-sm font-medium text-ink">Select your Supplier Balances CSV</p>
            <p className="mb-4 text-xs text-ink-faint">
              Column headers are checked as soon as you pick a file.
            </p>
            <Button variant="primary" onClick={handleSelectClick}>
              Select file
            </Button>
          </div>
        ) : (
          <ImportFileState state={state} onDismiss={handleSelectDifferent} />
        )}

        <Button variant="primary" disabled={importDisabled} onClick={handleImportClick}>
          {state.status === 'importing' ? 'Importing…' : 'Import'}
        </Button>
      </div>
    </ImportModal>
  );
}
