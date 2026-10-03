// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getPaymentMethodsEnabled: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { PaymentMethodToggle } from './PaymentMethodToggle.js';

const getPaymentMethodsEnabled = vi.mocked(ipc.setting.getPaymentMethodsEnabled);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * P17-7 (docs/phases/PHASE_17.md §2.6/§8, S17-EXP-4, A17-5). Picker-
 * only behaviour: hides a disabled method, falls back to Cash.
 */
describe('PaymentMethodToggle', () => {
  it('shows all five methods before the IPC read resolves, and after it resolves to all-enabled', async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });

    render(<PaymentMethodToggle value="cash" onChange={vi.fn()} />);

    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Bank Transfer')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Easypaisa')).toBeTruthy();
    });
    expect(screen.getByText('JazzCash')).toBeTruthy();
    expect(screen.getByText('Cheque')).toBeTruthy();
  });

  it('hides a disabled method from the list entirely', async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: false,
      jazzcash: true,
      cheque: true,
    });

    render(<PaymentMethodToggle value="cash" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText('Easypaisa')).toBeNull();
    });
    expect(screen.getByText('Bank Transfer')).toBeTruthy();
  });

  it('falls back to Cash via onChange when the currently selected method becomes disabled', async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: false,
      jazzcash: true,
      cheque: true,
    });
    const onChange = vi.fn();

    render(<PaymentMethodToggle value="easypaisa" onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('cash');
    });
  });

  it('never falls back when the currently selected method stays enabled', async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });
    const onChange = vi.fn();

    render(<PaymentMethodToggle value="bank" onChange={onChange} />);

    await waitFor(() => {
      expect(getPaymentMethodsEnabled).toHaveBeenCalled();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
