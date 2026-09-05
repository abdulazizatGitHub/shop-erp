import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export type ModalSize = 'default' | 'wide';

const SIZE_CLASSES: Record<ModalSize, string> = {
  default: 'max-w-md',
  wide: 'max-w-4xl',
};

export interface ModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  /** 'alertdialog' for a warning that needs an explicit decision (e.g. negative-stock gate). */
  readonly role?: 'dialog' | 'alertdialog';
  /** 'wide' for content that needs real width — e.g. a line-item entry area. Defaults to 'default'. */
  readonly size?: ModalSize;
}

/**
 * Every confirmation/warning dialog in the app. Escape always closes;
 * the panel is focused on open so Enter/Escape work immediately without
 * an extra click, matching this app's keyboard-first design.
 */
export function Modal({
  open,
  title,
  children,
  onClose,
  role = 'dialog',
  size = 'default',
}: ModalProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        role={role}
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        className={`w-full ${SIZE_CLASSES[size]} rounded-lg bg-surface p-6 shadow-lg outline-none`}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-m-1 rounded-md p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
