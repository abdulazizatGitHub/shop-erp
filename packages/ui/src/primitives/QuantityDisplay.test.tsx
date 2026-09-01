// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuantityDisplay } from './QuantityDisplay.js';

afterEach(cleanup);

describe('QuantityDisplay', () => {
  // 34500 milli = 34.5 units (CLAUDE.md §3.2's own example).
  it('formats milli-units with an optional unit label', () => {
    const { getByText } = render(<QuantityDisplay quantityMilli={34500} unitLabel="Kg" />);
    expect(getByText('34.5 Kg')).toBeTruthy();
  });

  it('renders without a unit label', () => {
    const { getByText } = render(<QuantityDisplay quantityMilli={2000} />);
    expect(getByText('2')).toBeTruthy();
  });
});
