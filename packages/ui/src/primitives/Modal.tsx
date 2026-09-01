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
        <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
