// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MoneyDisplay } from './MoneyDisplay.js';

afterEach(cleanup);

describe('MoneyDisplay', () => {
  // Rs 34,500.50 = 3450050 paisa (CLAUDE.md §3.1's own example).
  it('formats paisa as "Rs X,XXX.XX" in a monospace, tabular-nums span', () => {
    const { getByText } = render(<MoneyDisplay paisaValue={3450050} />);
    const el = getByText('Rs 34,500.50');
    expect(el.className).toContain('font-mono');
    expect(el.className).toContain('tabular-nums');
  });

  it('colours a negative amount red by default (auto tone)', () => {
    const { getByText } = render(<MoneyDisplay paisaValue={-500} />);
    expect(getByText('-Rs 5').className).toContain('text-danger');
  });

  it('renders every explicit tone without crashing', () => {
    const tones = ['in', 'out', 'due', 'muted', 'auto'] as const;
    for (const tone of tones) {
      const { getByText, unmount } = render(<MoneyDisplay paisaValue={100} tone={tone} />);
      expect(getByText('Rs 1')).toBeTruthy();
      unmount();
    }
  });
});
