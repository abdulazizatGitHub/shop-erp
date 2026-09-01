// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Alert } from './Alert.js';

afterEach(cleanup);

describe('Alert', () => {
  it('renders danger/warning as role="alert" and success as role="status"', () => {
    const { getByRole, rerender } = render(<Alert variant="danger">Stock below zero</Alert>);
    expect(getByRole('alert').textContent).toContain('Stock below zero');

    rerender(<Alert variant="warning">Credit limit exceeded</Alert>);
    expect(getByRole('alert').textContent).toContain('Credit limit exceeded');

    rerender(<Alert variant="success">Sale saved</Alert>);
    expect(getByRole('status').textContent).toContain('Sale saved');
  });

  it('shows a dismiss button only when onDismiss is passed', () => {
    const onDismiss = vi.fn();
    const { queryByRole, rerender } = render(<Alert variant="danger">Error</Alert>);
    expect(queryByRole('button')).toBeNull();

    rerender(
      <Alert variant="danger" onDismiss={onDismiss}>
        Error
      </Alert>,
    );
    expect(queryByRole('button')).toBeTruthy();
  });
});
