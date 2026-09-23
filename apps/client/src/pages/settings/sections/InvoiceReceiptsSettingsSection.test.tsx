// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getShopIdentity: vi.fn(),
      setShopIdentity: vi.fn(),
      getReceiptPaperSize: vi.fn(),
      setReceiptPaperSize: vi.fn(),
    },
  },
}));

import { ipc } from '../../../lib/ipc.js';
import { SettingsSectionFrame } from '../SettingsSectionFrame.js';
import { InvoiceReceiptsSettingsSection } from './InvoiceReceiptsSettingsSection.js';

// FIX-B (P16-1b review): Save now renders in SettingsSectionFrame's shared
// bottom action bar (via useSectionActions), not inline in the section's
// own JSX — so the section must be rendered inside a frame here, matching
// how SettingsPage.tsx actually composes it.
function renderInFrame(): ReturnType<typeof render> {
  return render(
    <SettingsSectionFrame title="Invoices & Receipts" description="">
      <InvoiceReceiptsSettingsSection />
    </SettingsSectionFrame>,
  );
}

const getShopIdentity = vi.mocked(ipc.setting.getShopIdentity);
const setShopIdentity = vi.mocked(ipc.setting.setShopIdentity);
const getReceiptPaperSize = vi.mocked(ipc.setting.getReceiptPaperSize);
const setReceiptPaperSize = vi.mocked(ipc.setting.setReceiptPaperSize);

const IDENTITY = {
  shopName: 'Shop',
  shopPhone: '0300',
  shopAddress: 'Addr',
  shopEmail: null,
  invoiceHeaderText: 'Old header',
  invoiceFooterText: null,
  statementFooterText: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InvoiceReceiptsSettingsSection — ONE Save (owner correction), paper size as a normal dirty-tracked field', () => {
  it('Save calls setShopIdentity and setReceiptPaperSize in sequence, both succeeding', async () => {
    getShopIdentity.mockResolvedValue(IDENTITY);
    getReceiptPaperSize.mockResolvedValue('A4');
    setShopIdentity.mockResolvedValue(undefined);
    setReceiptPaperSize.mockResolvedValue(undefined);

    renderInFrame();
    await screen.findByDisplayValue('Old header');

    fireEvent.change(screen.getByLabelText('Invoice header text'), {
      target: { value: 'New header' },
    });
    fireEvent.click(screen.getByText('A5'));
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Invoices & receipts settings saved.');

    expect(setShopIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceHeaderText: 'New header' }),
    );
    expect(setReceiptPaperSize).toHaveBeenCalledWith({ value: 'A5' });
  });

  it('changing A4/A5 alone marks the section dirty and does not call setReceiptPaperSize until Save', async () => {
    getShopIdentity.mockResolvedValue(IDENTITY);
    getReceiptPaperSize.mockResolvedValue('A4');

    renderInFrame();
    await screen.findByDisplayValue('Old header');

    const saveButton = screen.getByText('Save');
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByText('A5'));

    expect(setReceiptPaperSize).not.toHaveBeenCalled();
    expect(saveButton.hasAttribute('disabled')).toBe(false);
  });

  it('paper-size save fails while identity text save succeeds: error names paper size, section stays dirty', async () => {
    getShopIdentity.mockResolvedValue(IDENTITY);
    getReceiptPaperSize.mockResolvedValue('A4');
    setShopIdentity.mockResolvedValue(undefined);
    setReceiptPaperSize.mockRejectedValueOnce(new Error('disk full'));

    renderInFrame();
    await screen.findByDisplayValue('Old header');

    fireEvent.click(screen.getByText('A5'));
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Failed to save paper size — invoice/receipt text was saved.');

    // Still dirty: Save stays enabled, resending is fine (not required to skip the text half).
    expect(screen.getByText('Save').hasAttribute('disabled')).toBe(false);
  });
});
