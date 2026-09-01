// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Select } from './Select.js';

afterEach(cleanup);

describe('Select', () => {
  it('renders with a label and forwards the ref to the real <select>', () => {
    const ref = createRef<HTMLSelectElement>();
    const { getByLabelText } = render(
      <Select ref={ref} label="Business unit">
        <option value="a">Spare Parts</option>
      </Select>,
    );
    const select = getByLabelText('Business unit');
    expect(select.tagName).toBe('SELECT');
    expect(ref.current).toBe(select);
  });

  it('renders without a label (no wrapping <label>)', () => {
    const { getByRole } = render(
      <Select aria-label="Stock UoM">
        <option value="a">Piece</option>
      </Select>,
    );
    expect(getByRole('combobox')).toBeTruthy();
  });
});
