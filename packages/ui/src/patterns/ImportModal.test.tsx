// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportModal } from './ImportModal.js';

afterEach(cleanup);

describe('ImportModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ImportModal
        open={false}
        title="Import Items"
        onClose={() => undefined}
        instructions={<p>Instructions</p>}
      >
        <p>Upload area</p>
      </ImportModal>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows page 1 (instructions) first, and advances to page 2 on Continue', () => {
    const { getByText, queryByText } = render(
      <ImportModal
        open
        title="Import Items"
        onClose={() => undefined}
        instructions={<p>Column instructions here</p>}
      >
        <p>Dry run / commit here</p>
      </ImportModal>,
    );

    expect(getByText('Import Items — Step 1 of 2')).toBeTruthy();
    expect(getByText('Column instructions here')).toBeTruthy();
    expect(queryByText('Dry run / commit here')).toBeNull();

    fireEvent.click(getByText('Continue to upload'));

    expect(getByText('Import Items — Step 2 of 2')).toBeTruthy();
    expect(getByText('Dry run / commit here')).toBeTruthy();
    expect(queryByText('Column instructions here')).toBeNull();
  });

  it('Back on page 2 returns to page 1', () => {
    const { getByText } = render(
      <ImportModal
        open
        title="Import Items"
        onClose={() => undefined}
        instructions={<p>Column instructions here</p>}
      >
        <p>Dry run / commit here</p>
      </ImportModal>,
    );

    fireEvent.click(getByText('Continue to upload'));
    fireEvent.click(getByText('Back'));

    expect(getByText('Import Items — Step 1 of 2')).toBeTruthy();
  });
});
