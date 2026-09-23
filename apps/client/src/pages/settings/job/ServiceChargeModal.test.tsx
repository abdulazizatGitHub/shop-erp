// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ipc.js', () => ({
  ipc: {
    job: {
      createServiceCharge: vi.fn(),
    },
  },
}));

import { ipc } from '../../../lib/ipc.js';
import { ServiceChargeModal } from './ServiceChargeModal.js';

const createServiceCharge = vi.mocked(ipc.job.createServiceCharge);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fillName(): void {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'AC Installation' } });
}

describe('ServiceChargeModal — Rs/percent conversion (review finding, uses Money.fromRupees/Money.fromPercent, not ad-hoc parseFloat*100)', () => {
  it('"1999.50" Rs -> 199950 paisa', async () => {
    createServiceCharge.mockResolvedValue({
      id: 'sc1',
      name: 'AC Installation',
      jobType: null,
      retailChargePaisa: 199950,
      wholesaleChargePaisa: null,
      commissionMode: 'none',
      commissionAmountPaisa: null,
      commissionBp: null,
      typicalMinutes: null,
      isActive: true,
      notes: null,
      createdAt: '2026-09-23T00:00:00.000Z',
    });

    render(<ServiceChargeModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fillName();
    fireEvent.change(screen.getByLabelText('Retail charge (Rs)'), {
      target: { value: '1999.50' },
    });
    fireEvent.click(screen.getByText('Save'));

    await vi.waitFor(() => {
      expect(createServiceCharge).toHaveBeenCalled();
    });
    expect(createServiceCharge.mock.calls[0]?.[0]).toMatchObject({ retailChargePaisa: 199950 });
  });

  it('"12.34"% -> 1234 bp', async () => {
    createServiceCharge.mockResolvedValue({
      id: 'sc1',
      name: 'Compressor Replacement Labour',
      jobType: null,
      retailChargePaisa: 400000,
      wholesaleChargePaisa: null,
      commissionMode: 'bp',
      commissionAmountPaisa: null,
      commissionBp: 1234,
      typicalMinutes: null,
      isActive: true,
      notes: null,
      createdAt: '2026-09-23T00:00:00.000Z',
    });

    render(<ServiceChargeModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fillName();
    fireEvent.change(screen.getByLabelText('Retail charge (Rs)'), { target: { value: '4000' } });
    fireEvent.change(screen.getByLabelText('Commission'), { target: { value: 'bp' } });
    fireEvent.change(screen.getByLabelText('Commission (% of charge)'), {
      target: { value: '12.34' },
    });
    fireEvent.click(screen.getByText('Save'));

    await vi.waitFor(() => {
      expect(createServiceCharge).toHaveBeenCalled();
    });
    expect(createServiceCharge.mock.calls[0]?.[0]).toMatchObject({ commissionBp: 1234 });
  });

  it('a percent that does not resolve to a whole basis point (e.g. "12.345") is rejected, not rounded silently — no IPC call is made', async () => {
    render(<ServiceChargeModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fillName();
    fireEvent.change(screen.getByLabelText('Retail charge (Rs)'), { target: { value: '4000' } });
    fireEvent.change(screen.getByLabelText('Commission'), { target: { value: 'bp' } });
    fireEvent.change(screen.getByLabelText('Commission (% of charge)'), {
      target: { value: '12.345' },
    });
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText(/whole basis points/);
    expect(createServiceCharge).not.toHaveBeenCalled();
  });

  it('a non-numeric retail charge ("abc") is rejected — no IPC call is made', async () => {
    render(<ServiceChargeModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fillName();
    fireEvent.change(screen.getByLabelText('Retail charge (Rs)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('Save'));

    await screen.findByText('Retail charge must be a valid amount');
    expect(createServiceCharge).not.toHaveBeenCalled();
  });
});
