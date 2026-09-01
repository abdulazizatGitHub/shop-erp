// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.js';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Cancel sale"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      >
        Are you sure?
      </ConfirmDialog>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ConfirmDialog
        open
        title="Cancel sale"
        confirmLabel="Yes, cancel"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      >
        Are you sure?
      </ConfirmDialog>,
    );
    getByText('Yes, cancel').click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    const { getByText } = render(
      <ConfirmDialog open title="Cancel sale" onConfirm={() => undefined} onCancel={onCancel}>
        Are you sure?
      </ConfirmDialog>,
    );
    getByText('Cancel').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses cancelLabel in place of the default "Cancel" text when given', () => {
    const onCancel = vi.fn();
    const { getByText } = render(
      <ConfirmDialog
        open
        title="Cancel purchase?"
        cancelLabel="Keep it"
        onConfirm={() => undefined}
        onCancel={onCancel}
      >
        Are you sure?
      </ConfirmDialog>,
    );
    getByText('Keep it').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
