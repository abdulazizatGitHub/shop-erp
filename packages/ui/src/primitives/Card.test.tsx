// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from './Card.js';

afterEach(cleanup);

describe('Card', () => {
  it('renders with and without a title, without crashing', () => {
    const { getByText, rerender } = render(<Card title="Stock valuation">content</Card>);
    expect(getByText('Stock valuation')).toBeTruthy();
    expect(getByText('content')).toBeTruthy();

    rerender(<Card>content only</Card>);
    expect(getByText('content only')).toBeTruthy();
  });
});
