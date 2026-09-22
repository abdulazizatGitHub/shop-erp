// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    job: {
      listServiceChargesAdmin: vi.fn(),
      createServiceCharge: vi.fn(),
      updateServiceCharge: vi.fn(),
      toggleServiceCharge: vi.fn(),
    },
  },
}));

import type { ServiceChargeAdminDto } from '@shop/contracts';
import { ipc } from '../../../lib/ipc.js';
import { ServiceChargesTab } from './ServiceChargesTab.js';

const listServiceChargesAdmin = vi.mocked(ipc.job.listServiceChargesAdmin);

const CHARGES: readonly ServiceChargeAdminDto[] = [
  {
    id: 'sc1',
    name: 'AC Installation',
    jobType: 'installation',
    retailChargePaisa: 300000,
    wholesaleChargePaisa: null,
    commissionMode: 'fixed',
    commissionAmountPaisa: 50000,
    commissionBp: null,
    typicalMinutes: null,
    isActive: true,
    notes: null,
    createdAt: '2026-09-23T00:00:00.000Z',
  },
  {
    id: 'sc2',
    name: 'Checking Fee',
    jobType: null,
    retailChargePaisa: 30000,
    wholesaleChargePaisa: null,
    commissionMode: 'none',
    commissionAmountPaisa: null,
    commissionBp: null,
    typicalMinutes: null,
    isActive: false,
    notes: null,
    createdAt: '2026-09-23T00:00:00.000Z',
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ServiceChargesTab (P16-1)', () => {
  it('lists both active and inactive charges, with commission mode and status shown for each', async () => {
    listServiceChargesAdmin.mockResolvedValue(CHARGES);

    render(<ServiceChargesTab />);

    await waitFor(() => {
      expect(screen.getByText('AC Installation')).toBeTruthy();
    });
    expect(screen.getByText('Checking Fee')).toBeTruthy();
    expect(screen.getByText('Rs 500 fixed')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });
});
