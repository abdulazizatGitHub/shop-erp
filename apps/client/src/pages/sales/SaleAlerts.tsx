import { Alert } from '@shop/ui';

/**
 * Phase 18, go-live criterion 5 (BUG-33). Plain constant, matching the
 * other sale-screen banner copy below — this screen does not route its
 * strings through i18n yet.
 */
const NO_CASH_SESSION_MESSAGE =
  'No cash session is open. This sale will not appear in today’s cash count.';

export interface SaleAlertsProps {
  readonly error: string | null;
  readonly notice: string | null;
  readonly printError: string | null;
  readonly noCashSession: boolean;
  readonly onDismissNotice: () => void;
  readonly onDismissPrintError: () => void;
  readonly onDismissNoCashSession: () => void;
}

/** Error/notice/print-error banners for the sale screen. Purely presentational. */
export function SaleAlerts({
  error,
  notice,
  printError,
  noCashSession,
  onDismissNotice,
  onDismissPrintError,
  onDismissNoCashSession,
}: SaleAlertsProps): React.JSX.Element | null {
  if (!error && !notice && !printError && !noCashSession) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {noCashSession && (
        <Alert variant="warning" onDismiss={onDismissNoCashSession}>
          {NO_CASH_SESSION_MESSAGE}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" onDismiss={onDismissNotice}>
          {notice}
        </Alert>
      )}
      {printError && (
        <Alert variant="warning" onDismiss={onDismissPrintError}>
          Receipt/invoice did not print: {printError} — the sale itself is saved; use Reprint or
          Print Invoice below once the printer issue is fixed.
        </Alert>
      )}
    </div>
  );
}
