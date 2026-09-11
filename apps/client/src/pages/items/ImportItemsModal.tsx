import { FileText } from 'lucide-react';
import { Button, ImportModal } from '@shop/ui';
import { ImportFileState } from './ImportFileState.js';
import { ImportItemsInstructions } from './ImportItemsInstructions.js';
import { ITEM_COLUMNS, useImportItemsFlow } from './useImportItemsFlow.js';

const ITEM_SAMPLE_ROW = [
  '',
  'Gas R-134a',
  '',
  'Spare Parts',
  '',
  '',
  '13.6 kg cylinder',
  'Kg',
  'Cylinder',
  '13.6',
  'Y',
  'N',
  '35000',
  '4200',
  '4000',
  '5',
  'Shelf A1',
  '',
  '',
  '',
];

const OPENING_STOCK_SAMPLE_HEADERS = [
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

export interface ImportItemsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called once after a successful commit, so the caller can reload its item list. */
  readonly onImported: () => void;
}

/**
 * Option B redesign (2026-09-10): file picking/validation/state machine
 * live in useImportItemsFlow; this component is a thin render shell.
 */
export function ImportItemsModal({
  open,
  onClose,
  onImported,
}: ImportItemsModalProps): React.JSX.Element | null {
  const {
    state,
    fileInputRef,
    importDisabled,
    handleSelectClick,
    handleSelectDifferent,
    handleFileChange,
    handleImportClick,
    handleModalClose,
  } = useImportItemsFlow(open, onClose, onImported);

  return (
    <ImportModal
      open={open}
      title="Import Items"
      onClose={handleModalClose}
      navDisabled={state.status === 'importing'}
      instructions={
        <ImportItemsInstructions
          itemColumns={ITEM_COLUMNS}
          itemSampleRow={ITEM_SAMPLE_ROW}
          openingStockColumns={OPENING_STOCK_SAMPLE_HEADERS}
          openingStockSampleRow={OPENING_STOCK_SAMPLE_ROW}
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
            <p className="mb-1 text-sm font-medium text-ink">Select your Items CSV</p>
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
