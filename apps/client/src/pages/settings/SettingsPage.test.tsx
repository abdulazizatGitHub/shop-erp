// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    setting: {
      getShopIdentity: vi.fn(),
      setShopIdentity: vi.fn(),
      getReceiptPaperSize: vi.fn(),
      setReceiptPaperSize: vi.fn(),
      getDiscountApplyWalkin: vi.fn(),
      setDiscountApplyWalkin: vi.fn(),
      getDiscountApplyWholesale: vi.fn(),
      setDiscountApplyWholesale: vi.fn(),
      getDiscountPkrEnabled: vi.fn(),
      setDiscountPkrEnabled: vi.fn(),
      getDiscountPctEnabled: vi.fn(),
      setDiscountPctEnabled: vi.fn(),
      getDiscountPkrPresets: vi.fn(),
      setDiscountPkrPresets: vi.fn(),
      getDiscountPctPresets: vi.fn(),
      setDiscountPctPresets: vi.fn(),
    },
    job: {
      listServiceChargesAdmin: vi.fn(),
    },
  },
}));

import { ipc } from '../../lib/ipc.js';
import { SettingsPage } from './SettingsPage.js';

const getShopIdentity = vi.mocked(ipc.setting.getShopIdentity);
const setShopIdentity = vi.mocked(ipc.setting.setShopIdentity);
const getReceiptPaperSize = vi.mocked(ipc.setting.getReceiptPaperSize);
const getDiscountApplyWalkin = vi.mocked(ipc.setting.getDiscountApplyWalkin);
const getDiscountApplyWholesale = vi.mocked(ipc.setting.getDiscountApplyWholesale);
const getDiscountPkrEnabled = vi.mocked(ipc.setting.getDiscountPkrEnabled);
const getDiscountPctEnabled = vi.mocked(ipc.setting.getDiscountPctEnabled);
const getDiscountPkrPresets = vi.mocked(ipc.setting.getDiscountPkrPresets);
const getDiscountPctPresets = vi.mocked(ipc.setting.getDiscountPctPresets);
const listServiceChargesAdmin = vi.mocked(ipc.job.listServiceChargesAdmin);

const IDENTITY = {
  shopName: 'Malakand AC & Fridge',
  shopPhone: '0300',
  shopAddress: 'Main Bazaar',
  shopEmail: null,
  invoiceHeaderText: null,
  invoiceFooterText: null,
  statementFooterText: null,
};

function mockEverything(): void {
  getShopIdentity.mockResolvedValue(IDENTITY);
  setShopIdentity.mockResolvedValue(undefined);
  getReceiptPaperSize.mockResolvedValue('A4');
  getDiscountApplyWalkin.mockResolvedValue(false);
  getDiscountApplyWholesale.mockResolvedValue(false);
  getDiscountPkrEnabled.mockResolvedValue(false);
  getDiscountPctEnabled.mockResolvedValue(false);
  getDiscountPkrPresets.mockResolvedValue([]);
  getDiscountPctPresets.mockResolvedValue([]);
  listServiceChargesAdmin.mockResolvedValue([]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderAt(path: string): void {
  mockEverything();
  render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('SettingsPage — P16-1b routing (OD-16-11)', () => {
  it('/settings redirects to /settings/shop', async () => {
    renderAt('/settings');
    await waitFor(() => {
      expect(
        screen.getByText('Basic information shown on receipts and throughout the system.'),
      ).toBeTruthy();
    });
  });

  it('FIX-A: starting at "/" (App.tsx switching the main sidebar tab never touches the hash) redirects to /settings/shop, Shop active', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Shop' })).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: /^Shop/ }).getAttribute('aria-current')).toBe('page');
  });

  it('FIX-A: starting at an unrecognized /settings/* path redirects to /settings/shop', async () => {
    renderAt('/settings/nonsense');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Shop' })).toBeTruthy();
    });
  });

  it('FIX-A: starting at a valid deep-linked section (e.g. /settings/backup) renders it directly, no redirect', async () => {
    renderAt('/settings/backup');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Backup & Restore' })).toBeTruthy();
    });
  });

  it.each([
    ['Shop', 'Shop'],
    ['Invoices & Receipts', 'Invoices & Receipts'],
    ['Discounts', 'Discounts'],
    ['Service Charges', 'Service Charges'],
    ['Brands', 'Brands'],
    ['Commission Approvals', 'Commission Approvals'],
    ['Backup & Restore', 'Backup & Restore'],
  ])(
    'clicking "%s" in the sub-nav routes to its section and shows its title',
    async (navLabel, sectionTitle) => {
      renderAt('/settings/shop');
      await waitFor(() => {
        expect(
          screen.getByText('Basic information shown on receipts and throughout the system.'),
        ).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('link', { name: new RegExp(`^${navLabel}`) }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: sectionTitle })).toBeTruthy();
      });
    },
  );

  it('the active nav item carries aria-current="page"', async () => {
    renderAt('/settings/shop');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^Shop/ }).getAttribute('aria-current')).toBe('page');
    });

    fireEvent.click(screen.getByRole('link', { name: /^Discounts/ }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^Discounts/ }).getAttribute('aria-current')).toBe(
        'page',
      );
    });
    expect(screen.getByRole('link', { name: /^Shop/ }).getAttribute('aria-current')).toBeNull();
  });

  it('switching with a clean form navigates immediately, no confirm dialog', async () => {
    renderAt('/settings/shop');
    await waitFor(() => {
      expect(screen.getByDisplayValue('Malakand AC & Fridge')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('link', { name: /^Discounts/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Discounts' })).toBeTruthy();
    });
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
  });

  it('switching with a dirty form shows the confirm dialog; Stay keeps the edit, Discard navigates and reverts it', async () => {
    renderAt('/settings/shop');
    await waitFor(() => {
      expect(screen.getByDisplayValue('Malakand AC & Fridge')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Shop name (printed on every document)'), {
      target: { value: 'Renamed Shop' },
    });

    fireEvent.click(screen.getByRole('link', { name: /^Discounts/ }));
    await screen.findByText('Discard unsaved changes?');

    fireEvent.click(screen.getByText('Stay'));
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Shop' })).toBeTruthy();
    expect(screen.getByDisplayValue('Renamed Shop')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /^Discounts/ }));
    await screen.findByText('Discard unsaved changes?');
    fireEvent.click(screen.getByText('Discard'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Discounts' })).toBeTruthy();
    });
  });

  it('after a successful save, switching sections shows no dialog', async () => {
    renderAt('/settings/shop');
    await waitFor(() => {
      expect(screen.getByDisplayValue('Malakand AC & Fridge')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Shop name (printed on every document)'), {
      target: { value: 'Renamed Shop' },
    });
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Shop settings saved.');

    fireEvent.click(screen.getByRole('link', { name: /^Discounts/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Discounts' })).toBeTruthy();
    });
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
  });

  it('a failed save keeps the form dirty and shows the error', async () => {
    renderAt('/settings/shop');
    await waitFor(() => {
      expect(screen.getByDisplayValue('Malakand AC & Fridge')).toBeTruthy();
    });

    setShopIdentity.mockRejectedValueOnce(new Error('DB is busy'));
    fireEvent.change(screen.getByLabelText('Shop name (printed on every document)'), {
      target: { value: 'Renamed Shop' },
    });
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('DB is busy');

    fireEvent.click(screen.getByRole('link', { name: /^Discounts/ }));
    await screen.findByText('Discard unsaved changes?');
  });
});
