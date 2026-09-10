import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, X, XCircle } from 'lucide-react';
import type { ToastItem, ToastVariant } from './ToastContext.js';

const ICONS: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: AlertCircle,
};

const ICON_CLASSES: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-brand',
};

export interface ToastProps {
  readonly toast: ToastItem;
  readonly onDismiss: (id: string) => void;
}

/** One toast: slide-in + fade-in on mount, slide-out + fade-out before removal. */
export function Toast({ toast, onDismiss }: ToastProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 200);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    const timer = setTimeout(handleDismiss, toast.durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [handleDismiss, toast.durationMs]);

  const Icon = ICONS[toast.variant];

  return (
    <div
      className={`flex min-h-[56px] w-80 items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,.12)] transition-all duration-200 ease-out ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <Icon
        size={16}
        strokeWidth={1.5}
        className={`mt-0.5 shrink-0 ${ICON_CLASSES[toast.variant]}`}
      />
      <div className="min-w-0 flex-1">
        {toast.title ? (
          <>
            <p className="text-sm font-medium text-ink">{toast.title}</p>
            <p className="text-sm text-ink-faint">{toast.message}</p>
          </>
        ) : (
          <p className="text-sm text-ink">{toast.message}</p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="ml-2 shrink-0 text-ink-faint hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export interface ToastContainerProps {
  readonly toasts: readonly ToastItem[];
  readonly onDismiss: (id: string) => void;
}

/** Fixed bottom-right stack — bottom-anchored, so new toasts push older ones upward. */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps): React.JSX.Element {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
