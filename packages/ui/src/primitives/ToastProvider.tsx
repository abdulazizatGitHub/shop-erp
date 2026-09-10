import { useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToastContainer } from './ToastContainer.js';
import { ToastContext } from './ToastContext.js';
import type { ShowToastFn, ToastItem, ToastVariant } from './ToastContext.js';

/** Exported for direct unit testing (see ToastProvider.test.tsx) — otherwise internal. */
export const TOAST_DURATION_MS: Record<ToastVariant, number> = {
  success: 3000,
  error: 6000,
  warning: 4000,
  info: 3000,
};

/** At most this many toasts are visible at once — a 4th drops the oldest immediately. */
const MAX_VISIBLE = 3;

export interface ToastProviderProps {
  readonly children: ReactNode;
}

/**
 * Wraps the app once (see App.tsx). Holds the toast list and renders it via
 * a portal to document.body so toasts always sit above every page's own
 * stacking context.
 */
export function ToastProvider({ children }: ToastProviderProps): React.JSX.Element {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast: ShowToastFn = useCallback((options) => {
    const toast: ToastItem = {
      id: crypto.randomUUID(),
      variant: options.variant,
      message: options.message,
      durationMs: TOAST_DURATION_MS[options.variant],
      ...(options.title !== undefined ? { title: options.title } : {}),
    };
    setToasts((prev) => {
      const next = [...prev, toast];
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(<ToastContainer toasts={toasts} onDismiss={dismiss} />, document.body)}
    </ToastContext.Provider>
  );
}

/** Throws when called outside a ToastProvider — a missing wrapper is a bug, not a silent no-op. */
export function useToast(): { showToast: ShowToastFn } {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
