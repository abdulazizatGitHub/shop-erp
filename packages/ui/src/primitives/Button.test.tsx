// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button.js';

afterEach(cleanup);

describe('Button', () => {
  it('renders each variant without crashing', () => {
    const { getByText, rerender } = render(<Button variant="primary">Save</Button>);
    expect(getByText('Save')).toBeTruthy();

    rerender(<Button variant="secondary">Cancel</Button>);
    expect(getByText('Cancel')).toBeTruthy();

    rerender(<Button variant="danger">Delete</Button>);
    expect(getByText('Delete')).toBeTruthy();

    rerender(<Button variant="warning">Continue</Button>);
    expect(getByText('Continue')).toBeTruthy();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    const { getByText } = render(<Button>Click</Button>);
    expect(getByText('Click').getAttribute('type')).toBe('button');
  });

  it('applies w-full only when fullWidth is set', () => {
    const { getByText, rerender } = render(<Button>Narrow</Button>);
    expect(getByText('Narrow').className).not.toContain('w-full');

    rerender(<Button fullWidth>Wide</Button>);
    expect(getByText('Wide').className).toContain('w-full');
  });
});
