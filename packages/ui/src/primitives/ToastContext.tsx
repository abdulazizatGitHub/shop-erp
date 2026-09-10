import { createContext } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  readonly id: string;
  readonly variant: ToastVariant;
  readonly title?: string;
  readonly message: string;
  readonly durationMs: number;
}

export interface ShowToastOptions {
  readonly variant: ToastVariant;
  readonly title?: string;
  readonly message: string;
}

export type ShowToastFn = (options: ShowToastOptions) => void;

export interface ToastContextValue {
  readonly showToast: ShowToastFn;
}

/** Context only — no rendering here. See ToastProvider.tsx for the implementation. */
export const ToastContext = createContext<ToastContextValue | null>(null);
