// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Spinner } from './Spinner.js';

afterEach(cleanup);

describe('Spinner', () => {
  it('renders both sizes without crashing', () => {
    const { container, rerender } = render(<Spinner />);
    expect(container.querySelector('span')).toBeTruthy();

    rerender(<Spinner size="sm" />);
    expect(container.querySelector('span')?.className).toContain('h-3');
  });
});
