import { Alert } from '@shop/ui';

export interface SaleAlertsProps {
  readonly error: string | null;
  readonly notice: string | null;
  readonly printError: string | null;
  readonly onDismissNotice: () => void;
  readonly onDismissPrintError: () => void;
}

/** Error/notice/print-error banners for the sale screen. Purely presentational. */
export function SaleAlerts({
  error,
  notice,
  printError,
  onDismissNotice,
  onDismissPrintError,
}: SaleAlertsProps): React.JSX.Element | null {
  if (!error && !notice && !printError) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      {error && <Alert variant="danger">{error}</Alert>}
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
