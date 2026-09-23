// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getShopIdentity: vi.fn(),
      setShopIdentity: vi.fn(),
    },
  },
}));

import { ipc } from '../../../lib/ipc.js';
import { SettingsSectionFrame } from '../SettingsSectionFrame.js';
import { ShopSettingsSection } from './ShopSettingsSection.js';

// FIX-B (P16-1b review): Save now renders in SettingsSectionFrame's shared
// bottom action bar (via useSectionActions), not inline in the section's
// own JSX — so the section must be rendered inside a frame here, matching
// how SettingsPage.tsx actually composes it.
function renderInFrame(): ReturnType<typeof render> {
  return render(
    <SettingsSectionFrame title="Shop" description="">
      <ShopSettingsSection />
    </SettingsSectionFrame>,
  );
}

const getShopIdentity = vi.mocked(ipc.setting.getShopIdentity);
const setShopIdentity = vi.mocked(ipc.setting.setShopIdentity);

const MOUNT_IDENTITY = {
  shopName: 'Old Name',
  shopPhone: '0300',
  shopAddress: 'Old Address',
  shopEmail: null,
  invoiceHeaderText: 'Header at mount',
  invoiceFooterText: null,
  statementFooterText: null,
};

// Different from MOUNT_IDENTITY's invoice/statement fields — proves the
// save path re-fetches at save time rather than reusing the mount copy.
const FRESH_AT_SAVE_IDENTITY = {
  ...MOUNT_IDENTITY,
  invoiceHeaderText: 'Header changed by Invoices & Receipts after mount',
  invoiceFooterText: 'Footer added after mount',
  statementFooterText: 'Statement footer added after mount',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ShopSettingsSection — save-time fresh fetch + overlay (owner correction, not the mount-time copy)', () => {
  it("saving sends the freshly-fetched identity overlaid with only this section's edited fields, not the stale mount-time copy", async () => {
    getShopIdentity
      .mockResolvedValueOnce(MOUNT_IDENTITY)
      .mockResolvedValueOnce(FRESH_AT_SAVE_IDENTITY);
    setShopIdentity.mockResolvedValue(undefined);

    renderInFrame();
    await screen.findByDisplayValue('Old Name');

    fireEvent.change(screen.getByLabelText('Shop name (printed on every document)'), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Shop settings saved.');

    expect(getShopIdentity).toHaveBeenCalledTimes(2);
    expect(setShopIdentity).toHaveBeenCalledWith({
      shopName: 'New Name',
      shopPhone: '0300',
      shopAddress: 'Old Address',
      shopEmail: null,
      invoiceHeaderText: 'Header changed by Invoices & Receipts after mount',
      invoiceFooterText: 'Footer added after mount',
      statementFooterText: 'Statement footer added after mount',
    });
  });

  it('a failed save keeps the form dirty (error shown, Save stays enabled with the unsaved edit still in the field)', async () => {
    getShopIdentity.mockResolvedValue(MOUNT_IDENTITY);
    setShopIdentity.mockRejectedValueOnce(new Error('DB is busy'));

    renderInFrame();
    await screen.findByDisplayValue('Old Name');

    fireEvent.change(screen.getByLabelText('Shop name (printed on every document)'), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('DB is busy');
    expect(screen.getByDisplayValue('New Name')).toBeTruthy();
    expect(screen.queryByText('Shop settings saved.')).toBeNull();
  });
});
