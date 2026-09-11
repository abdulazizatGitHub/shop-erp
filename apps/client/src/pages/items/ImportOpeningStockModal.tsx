import { FileText } from 'lucide-react';
import { Button, ImportModal } from '@shop/ui';
import { ImportFileState } from './ImportFileState.js';
import { ImportOpeningStockInstructions } from './ImportOpeningStockInstructions.js';
import { OPENING_STOCK_COLUMNS, useImportOpeningStockFlow } from './useImportOpeningStockFlow.js';

const OPENING_STOCK_SAMPLE_ROW = [
  'CU-PIPE-01',
  'Copper Pipe 10ft',
  '2026-08-31',
  '20',
  '250',
  '',
  'Shelf C1',
  '',
  '',
];

export interface ImportOpeningStockModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful commit, so the caller can reload its item list. */
  readonly onImported: () => void;
}

/**
 * Option B, Opening Stock (Session 52): separate from ImportItemsModal —
 * own button, own modal, own IPC channel (owner decision). Same six-state
 * file-picker shell as ImportItemsModal, driven by useImportOpeningStockFlow.
 */
export function ImportOpeningStockModal({
  open,
  onClose,
  onImported,
}: ImportOpeningStockModalProps): React.JSX.Element | null {
  const {
    state,
    fileInputRef,
    importDisabled,
    handleSelectClick,
    handleSelectDifferent,
    handleFileChange,
    handleImportClick,
    handleModalClose,
  } = useImportOpeningStockFlow(open, onClose, onImported);

  return (
    <ImportModal
      open={open}
      title="Import Opening Stock"
      onClose={handleModalClose}
      navDisabled={state.status === 'importing'}
      instructions={
        <ImportOpeningStockInstructions
          columns={OPENING_STOCK_COLUMNS}
          sampleRow={OPENING_STOCK_SAMPLE_ROW}
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
            <p className="mb-1 text-sm font-medium text-ink">Select your Opening Stock CSV</p>
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
