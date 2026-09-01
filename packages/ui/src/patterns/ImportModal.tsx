import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/Button.js';
import { Modal } from '../primitives/Modal.js';

export interface ImportModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  /** Page 1 body — instructions text + "Download sample CSV" button(s). */
  readonly instructions: ReactNode;
  /** Page 2 body — Dry Run/Commit buttons + result display; IPC calls stay caller-owned. */
  readonly children: ReactNode;
}

/**
 * Shared shell for every import flow's two-page modal (Items, Suppliers,
 * Customers) — only page navigation/title is generic here. File
 * selection itself stays native/server-side (no renderer-visible file
 * content exists in this app's IPC contract), so page 2 is "the next
 * click opens your file picker," not a drag-drop area — see
 * docs/phases/PHASE_4_5.md for why.
 */
export function ImportModal({
  open,
  title,
  onClose,
  instructions,
  children,
}: ImportModalProps): React.JSX.Element | null {
  const [page, setPage] = useState<1 | 2>(1);

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  if (!open) return null;

  return (
    <Modal open={open} title={`${title} — Step ${String(page)} of 2`} onClose={onClose}>
      {page === 1 ? (
        <div className="flex flex-col gap-4">
          {instructions}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setPage(2);
              }}
            >
              Continue to upload
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {children}
          <div className="flex justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
              }}
            >
              Back
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
