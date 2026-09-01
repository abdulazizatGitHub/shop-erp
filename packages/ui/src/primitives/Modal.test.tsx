// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal.js';

afterEach(cleanup);

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} title="Restore backup" onClose={() => undefined}>
        content
      </Modal>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the title and children when open, as a labelled dialog', () => {
    const { getByText, getByRole } = render(
      <Modal open title="Restore backup" onClose={() => undefined}>
        This will replace all current data.
      </Modal>,
    );
    expect(getByText('This will replace all current data.')).toBeTruthy();
    expect(getByRole('dialog').getAttribute('aria-label')).toBe('Restore backup');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Modal open title="Warning" onClose={onClose}>
        body
      </Modal>,
    );
    getByRole('dialog').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses role="alertdialog" when passed, matching the negative-stock warning gate', () => {
    const { getByRole } = render(
      <Modal open title="Warning" role="alertdialog" onClose={() => undefined}>
        body
      </Modal>,
    );
    expect(getByRole('alertdialog')).toBeTruthy();
  });
});
