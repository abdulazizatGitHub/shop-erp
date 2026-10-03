// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getPaymentMethodsEnabled: vi.fn(),
      setPaymentMethodBankEnabled: vi.fn(),
      setPaymentMethodEasypaisaEnabled: vi.fn(),
      setPaymentMethodJazzcashEnabled: vi.fn(),
      setPaymentMethodChequeEnabled: vi.fn(),
    },
  },
}));

import { ipc } from '../../../lib/ipc.js';
import { SettingsSectionFrame } from '../SettingsSectionFrame.js';
import { PaymentMethodsSettingsSection } from './PaymentMethodsSettingsSection.js';

const getPaymentMethodsEnabled = vi.mocked(ipc.setting.getPaymentMethodsEnabled);
const setPaymentMethodBankEnabled = vi.mocked(ipc.setting.setPaymentMethodBankEnabled);
const setPaymentMethodEasypaisaEnabled = vi.mocked(ipc.setting.setPaymentMethodEasypaisaEnabled);
const setPaymentMethodJazzcashEnabled = vi.mocked(ipc.setting.setPaymentMethodJazzcashEnabled);
const setPaymentMethodChequeEnabled = vi.mocked(ipc.setting.setPaymentMethodChequeEnabled);

function renderInFrame(): ReturnType<typeof render> {
  return render(
    <SettingsSectionFrame title="Payment Methods" description="">
      <PaymentMethodsSettingsSection />
    </SettingsSectionFrame>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * P17-7 (docs/phases/PHASE_17.md §2.6/§8, S17-EXP-4, A17-5).
 */
describe('PaymentMethodsSettingsSection', () => {
  it("shows Cash as a permanently checked, disabled checkbox — can't be unchecked", async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });

    renderInFrame();
    await screen.findByText('Cash (cannot be disabled)');

    const cashCheckbox = screen.getByLabelText('Cash (cannot be disabled)');
    expect((cashCheckbox as HTMLInputElement).checked).toBe(true);
    expect(cashCheckbox.hasAttribute('disabled')).toBe(true);
  });

  it('unchecking a non-cash method marks the section dirty and does not call its setter until Save', async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });

    renderInFrame();
    await screen.findByLabelText('Bank Transfer');

    const saveButton = screen.getByText('Save');
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByLabelText('Bank Transfer'));

    expect(setPaymentMethodBankEnabled).not.toHaveBeenCalled();
    expect(saveButton.hasAttribute('disabled')).toBe(false);
  });

  it('Save calls only the four non-cash setters, with the toggled values, and never a cash setter', async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });
    setPaymentMethodBankEnabled.mockResolvedValue(undefined);
    setPaymentMethodEasypaisaEnabled.mockResolvedValue(undefined);
    setPaymentMethodJazzcashEnabled.mockResolvedValue(undefined);
    setPaymentMethodChequeEnabled.mockResolvedValue(undefined);

    renderInFrame();
    await screen.findByLabelText('Easypaisa');

    fireEvent.click(screen.getByLabelText('Easypaisa'));
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Payment methods saved.');

    expect(setPaymentMethodBankEnabled).toHaveBeenCalledWith({ value: true });
    expect(setPaymentMethodEasypaisaEnabled).toHaveBeenCalledWith({ value: false });
    expect(setPaymentMethodJazzcashEnabled).toHaveBeenCalledWith({ value: true });
    expect(setPaymentMethodChequeEnabled).toHaveBeenCalledWith({ value: true });
  });

  it('shows the picker-only / never-server-side-enforced explanation', async () => {
    getPaymentMethodsEnabled.mockResolvedValue({
      cash: true,
      bank: true,
      easypaisa: true,
      jazzcash: true,
      cheque: true,
    });

    renderInFrame();

    expect(
      await screen.findByText(/never affects any payment already recorded with it/i),
    ).toBeTruthy();
  });
});
