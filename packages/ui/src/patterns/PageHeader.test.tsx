// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader.js';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders the title, and actions only when given', () => {
    const { getByText, queryByText, rerender } = render(<PageHeader title="Items" />);
    expect(getByText('Items')).toBeTruthy();

    rerender(<PageHeader title="Items" actions={<button type="button">Add item</button>} />);
    expect(queryByText('Add item')).toBeTruthy();
  });
});
