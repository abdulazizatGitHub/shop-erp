// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    brand: {
      listAdmin: vi.fn(),
      create: vi.fn(),
      toggleActive: vi.fn(),
    },
  },
}));

import type { BrandAdminDto } from '@shop/contracts';
import { ipc } from '../../../lib/ipc.js';
import { BrandsTab } from './BrandsTab.js';

const listAdmin = vi.mocked(ipc.brand.listAdmin);

const BRANDS: readonly BrandAdminDto[] = [
  { id: 'b1', name: 'Haier', isActive: true },
  { id: 'b2', name: 'Waves', isActive: false },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BrandsTab (P16-2)', () => {
  it('lists both active and inactive brands with status shown for each', async () => {
    listAdmin.mockResolvedValue(BRANDS);

    render(<BrandsTab />);

    await waitFor(() => {
      expect(screen.getByText('Haier')).toBeTruthy();
    });
    expect(screen.getByText('Waves')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });
});
