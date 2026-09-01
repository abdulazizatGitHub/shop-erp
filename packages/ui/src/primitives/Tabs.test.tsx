// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs.js';

afterEach(cleanup);

const ITEMS = [
  { key: 'list', label: 'List' },
  { key: 'add', label: 'Add' },
] as const;

describe('Tabs', () => {
  it('marks the active tab aria-selected and calls onChange when another is clicked', () => {
    const onChange = vi.fn();
    const { getByText } = render(<Tabs items={ITEMS} active="list" onChange={onChange} />);

    expect(getByText('List').getAttribute('aria-selected')).toBe('true');
    expect(getByText('Add').getAttribute('aria-selected')).toBe('false');

    getByText('Add').click();
    expect(onChange).toHaveBeenCalledWith('add');
  });
});
