import { useTranslation } from '@shop/i18n';
import { Spinner } from '../primitives/Spinner.js';

export interface LoadingStateProps {
  readonly message?: string;
}

/** Shown for any IPC call that can take >100ms — never a blank screen while data loads. */
export function LoadingState({ message }: LoadingStateProps): React.JSX.Element {
  const t = useTranslation();
  return (
    <div role="status" className="flex items-center gap-2 px-6 py-10 text-ink-muted">
      <Spinner />
      <span>{message ?? t('common.loading')}</span>
    </div>
  );
}
