import { FileText } from 'lucide-react';
import { Alert, Button, Card, TextInput, ToastProvider } from '@shop/ui';
import { ImportFileState } from '../items/ImportFileState.js';
import { ImportItemsInstructions } from '../items/ImportItemsInstructions.js';
import { ITEM_SAMPLE_ROW } from '../items/ImportItemsModal.js';
import { ITEM_COLUMNS } from '../items/useImportItemsFlow.js';
import { useSetupWizard } from './useSetupWizard.js';

export interface SetupWizardPageProps {
  /** Called once setup:finish resolves — AppRoot.tsx switches to the main app. */
  readonly onComplete: () => void;
}

/**
 * Phase 18, go-live preparation — shown instead of the main app when
 * the database has no tenant row yet (AppRoot.tsx). Wrapped in its own
 * ToastProvider: this screen replaces App.tsx entirely while it's
 * showing (App.tsx supplies its own provider, but that tree doesn't
 * exist yet), and the CSV import step's summary is delivered as a
 * toast, same as the Items screen's own import flow.
 */
export function SetupWizardPage({ onComplete }: SetupWizardPageProps): React.JSX.Element {
  return (
    <ToastProvider>
      <SetupWizardContent onComplete={onComplete} />
    </ToastProvider>
  );
}

function SetupWizardContent({ onComplete }: SetupWizardPageProps): React.JSX.Element {
  const {
    form,
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
  } = useSetupWizard(onComplete);

  return (
    <div className="flex min-h-screen items-start justify-center bg-surface-sunken px-4 py-10">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-ink">Welcome — let&apos;s set up your shop</h1>
          <p className="mt-1 text-sm text-ink-muted">
            This only runs once. You can change any of this later from Settings.
          </p>
        </div>

        {submitError && <Alert variant="danger">{submitError}</Alert>}

        <Card title="Shop details">
          <div className="flex flex-col gap-4">
            <TextInput
              label="Shop name"
              value={form.shopName}
              disabled={submitting}
              onChange={(e) => {
                setShopName(e.target.value);
              }}
            />
            <TextInput
              label="Owner name"
              value={form.ownerName}
              disabled={submitting}
              onChange={(e) => {
                setOwnerName(e.target.value);
              }}
            />
            <div>
              <p className="mb-2 text-sm font-medium text-ink-muted">Receipt paper size</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={form.paperSize === 'A4' ? 'primary' : 'secondary'}
                  size="large"
                  disabled={submitting}
                  onClick={() => {
                    setPaperSize('A4');
                  }}
                >
                  A4
                </Button>
                <Button
                  variant={form.paperSize === 'A5' ? 'primary' : 'secondary'}
                  size="large"
                  disabled={submitting}
                  onClick={() => {
                    setPaperSize('A5');
                  }}
                >
                  A5
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Import items (optional)">
          <div className="flex flex-col gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />

            {csvState.status === 'idle' ? (
              <>
                <ImportItemsInstructions
                  itemColumns={ITEM_COLUMNS}
                  itemSampleRow={ITEM_SAMPLE_ROW}
                />
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand/30 bg-surface-page px-6 py-8 text-center">
                  <FileText size={32} strokeWidth={1.5} className="mb-3 text-brand/50" />
                  <p className="mb-1 text-sm font-medium text-ink">Select your Items CSV</p>
                  <p className="mb-4 text-xs text-ink-faint">
                    You can skip this and import items later from the Items screen instead.
                  </p>
                  <Button variant="secondary" disabled={submitting} onClick={handleSelectClick}>
                    Select file
                  </Button>
                </div>
              </>
            ) : (
              <ImportFileState
                state={csvState}
                onDismiss={() => {
                  if (!submitting) handleSelectDifferent();
                }}
              />
            )}
          </div>
        </Card>

        <Button
          variant="primary"
          size="large"
          disabled={!canFinish}
          onClick={() => {
            handleFinish();
          }}
        >
          {submitting ? 'Setting up…' : 'Finish setup'}
        </Button>
      </div>
    </div>
  );
}
