import type { ReactNode } from 'react';
import { useTranslation } from '@shop/i18n';

export type AlertVariant = 'danger' | 'warning' | 'success';

export interface AlertProps {
  readonly variant: AlertVariant;
  readonly children: ReactNode;
  readonly onDismiss?: () => void;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  danger: 'border-danger bg-danger-subtle text-danger',
  warning: 'border-warning bg-warning-subtle text-warning',
  success: 'border-success bg-success-subtle text-success',
};

/**
 * Replaces every bare `role="alert"`/`role="status"` inline text in the app.
 * danger/warning keep role="alert" (assertive); success keeps role="status"
 * (polite) — matches the a11y behaviour the existing screens already rely on.
 */
export function Alert({ variant, children, onDismiss }: AlertProps): React.JSX.Element {
  const t = useTranslation();
  return (
    <div
      role={variant === 'success' ? 'status' : 'alert'}
      className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${VARIANT_CLASSES[variant]}`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={onDismiss}
          className="shrink-0 font-bold leading-none opacity-70 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
}
