// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TextInput } from './TextInput.js';

afterEach(cleanup);

describe('TextInput', () => {
  it('renders with a label and forwards the ref to the real <input>', () => {
    const ref = createRef<HTMLInputElement>();
    const { getByLabelText } = render(<TextInput ref={ref} label="Amount paid (Rs)" />);
    const input = getByLabelText('Amount paid (Rs)');
    expect(input.tagName).toBe('INPUT');
    expect(ref.current).toBe(input);
  });

  it('sets inputMode="decimal" for the number variant, matching Money/Qty parsing', () => {
    const { getByPlaceholderText } = render(<TextInput variant="number" placeholder="Quantity" />);
    expect(getByPlaceholderText('Quantity').getAttribute('inputmode')).toBe('decimal');
  });

  it('renders without a label (no wrapping <label>)', () => {
    const { getByPlaceholderText } = render(<TextInput placeholder="Search item" />);
    expect(getByPlaceholderText('Search item')).toBeTruthy();
  });

  it('is font-mono only for the number variant, and right-aligned only when asked', () => {
    const { getByPlaceholderText, rerender } = render(<TextInput placeholder="Name" />);
    expect(getByPlaceholderText('Name').className).toContain('font-sans');

    rerender(<TextInput variant="number" align="right" placeholder="Amount" />);
    const amountInput = getByPlaceholderText('Amount');
    expect(amountInput.className).toContain('font-mono');
    expect(amountInput.className).toContain('text-right');
  });
});
