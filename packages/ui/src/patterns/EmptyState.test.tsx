// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState.js';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders the message, and the hint only when given', () => {
    const { getByText, queryByText, rerender } = render(<EmptyState message="No items yet." />);
    expect(getByText('No items yet.')).toBeTruthy();

    rerender(<EmptyState message="No items yet." hint="Add your first item to get started." />);
    expect(queryByText('Add your first item to get started.')).toBeTruthy();
  });
});
