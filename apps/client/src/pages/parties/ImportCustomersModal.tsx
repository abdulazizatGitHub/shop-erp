import { FileText } from 'lucide-react';
import { Button, ImportModal } from '@shop/ui';
import { ImportFileState } from '../items/ImportFileState.js';
import { ImportCustomerBalanceInstructions } from './ImportCustomerBalanceInstructions.js';
import {
  CUSTOMER_BALANCE_COLUMNS,
  useImportCustomerBalanceFlow,
} from './useImportCustomerBalanceFlow.js';

const CUSTOMER_BALANCE_SAMPLE_ROW = [
  'Ahmad Retail',
  '03001234567',
  'BILL-2024-001',
  '2026-01-15',
  '12000',
  '5000',
  'Opening balance',
];

export interface ImportCustomersModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful commit, so the caller can reload its customer list. */
  readonly onImported: () => void;
}

/**
 * CL-10. Option B conversion: same six-state file-picker shell as
 * ImportSuppliersModal, driven by useImportCustomerBalanceFlow. Replaces
 * the old dialog.showOpenDialog/readFileSync-backed version.
 */
export function ImportCustomersModal({
  open,
  onClose,
  onImported,
}: ImportCustomersModalProps): React.JSX.Element | null {
  const {
    state,
    fileInputRef,
    importDisabled,
    handleSelectClick,
    handleSelectDifferent,
    handleFileChange,
    handleImportClick,
    handleModalClose,
  } = useImportCustomerBalanceFlow(open, onClose, onImported);

  return (
    <ImportModal
      open={open}
      title="Import Customer Balances"
      onClose={handleModalClose}
      navDisabled={state.status === 'importing'}
      instructions={
        <ImportCustomerBalanceInstructions
          columns={CUSTOMER_BALANCE_COLUMNS}
          sampleRow={CUSTOMER_BALANCE_SAMPLE_ROW}
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
            <p className="mb-1 text-sm font-medium text-ink">Select your Customer Balances CSV</p>
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
