// @vitest-environment jsdom
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, ToastProvider, useToast } from './ToastProvider.js';
import type { ToastVariant } from './ToastContext.js';

afterEach(cleanup);

function ToastTrigger({
  variant,
  message,
}: {
  readonly variant: ToastVariant;
  readonly message: string;
}): React.JSX.Element {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        showToast({ variant, message });
      }}
    >
      Fire
    </button>
  );
}

describe('ToastProvider / useToast', () => {
  it('showToast adds a toast to the visible list', () => {
    const { getByText, getByRole } = render(
      <ToastProvider>
        <ToastTrigger variant="success" message="Created ITM-A-000001" />
      </ToastProvider>,
    );
    act(() => {
      getByRole('button', { name: 'Fire' }).click();
    });
    expect(getByText('Created ITM-A-000001')).toBeTruthy();
  });

  it('dismiss removes a toast by id', () => {
    vi.useFakeTimers();
    const { getByText, getByRole, queryByText } = render(
      <ToastProvider>
        <ToastTrigger variant="info" message="Bye" />
      </ToastProvider>,
    );
    act(() => {
      getByRole('button', { name: 'Fire' }).click();
    });
    expect(getByText('Bye')).toBeTruthy();

    act(() => {
      getByRole('button', { name: 'Dismiss' }).click();
    });
    // The Toast component waits 200ms (its exit animation) before actually
    // calling the provider's dismiss(id) — see ToastContainer.tsx.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(queryByText('Bye')).toBeNull();
    vi.useRealTimers();
  });

  it("variant 'success' sets durationMs to 3000", () => {
    expect(TOAST_DURATION_MS.success).toBe(3000);
  });

  it("variant 'error' sets durationMs to 6000", () => {
    expect(TOAST_DURATION_MS.error).toBe(6000);
  });

  it('useToast throws when used outside a ToastProvider', () => {
    function Broken(): React.JSX.Element {
      useToast();
      return <></>;
    }
    // React logs its own error to the console for a thrown-during-render
    // component; suppress that noise for this expected-failure test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Broken />)).toThrow('useToast must be used within a ToastProvider');
    spy.mockRestore();
  });
});
