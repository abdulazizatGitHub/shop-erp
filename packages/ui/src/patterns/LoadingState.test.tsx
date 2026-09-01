// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingState } from './LoadingState.js';

afterEach(cleanup);

describe('LoadingState', () => {
  it('renders a polite status region with a default message', () => {
    const { getByRole } = render(<LoadingState />);
    expect(getByRole('status').textContent).toContain('Loading');
  });

  it('renders a custom message when given', () => {
    const { getByRole } = render(<LoadingState message="Loading report…" />);
    expect(getByRole('status').textContent).toContain('Loading report…');
  });
});
