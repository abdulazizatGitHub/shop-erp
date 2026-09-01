import type { ReactNode } from 'react';
import { useTranslation } from '@shop/i18n';
import { Button } from '../primitives/Button.js';
import type { ButtonVariant } from '../primitives/Button.js';
import { Modal } from '../primitives/Modal.js';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel?: string;
  /** Defaults to the common.cancel translation ("Cancel"). E.g. "Keep it" for a destructive-action gate. */
  readonly cancelLabel?: string;
  /** Defaults to 'primary'. Use 'warning' for a "continue anyway" gate, 'danger' for a destructive action. */
  readonly confirmVariant?: ButtonVariant;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Modal-based confirmation — e.g. restore-database confirmation, the
 * negative-stock/credit-limit warning gate (BUG-Y's fix). Enter confirms,
 * Escape cancels, matching every other keyboard-driven flow in this app.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  const t = useTranslation();
  if (!open) return null;
  return (
    <Modal open={open} title={title} onClose={onCancel} role="alertdialog">
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        <div className="mb-4 text-sm text-ink">{children}</div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
