// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobDto } from '@shop/contracts';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    job: {
      listJobParts: vi.fn().mockResolvedValue([]),
      listServiceCharges: vi.fn().mockResolvedValue([
        {
          id: 'sc-1',
          name: 'AC Installation',
          businessUnitId: 'bu-repair',
          retailChargePaisa: 150000,
        },
        { id: 'sc-2', name: 'Gas Charging', businessUnitId: 'bu-repair', retailChargePaisa: 80000 },
      ]),
      deliver: vi.fn(),
    },
  },
}));

import { JobDeliveryModal } from './JobDeliveryModal.js';

afterEach(cleanup);

const JOB: JobDto = {
  id: 'job-1',
  docNo: 'JOB-0001',
  customerId: 'cust-1',
  customerNameAdhoc: null,
  customerPhone: null,
  jobClientId: null,
  jobClientName: null,
  jobClientPhone: null,
  jobType: 'in_shop',
  applianceType: 'AC',
  applianceBrand: 'Gree',
  applianceModel: null,
  applianceSerial: null,
  reportedFault: 'Not cooling',
  receivedDate: '2026-09-20',
  promisedDate: null,
  estimateAmountPaisa: null,
  estimateApproved: false,
  assignedTo: null,
  status: 'ready',
  businessUnitId: 'bu-repair',
  billToPartyId: null,
  revenueType: 'customer_paid',
  labourChargePaisa: 0,
  saleId: null,
  invoiceDocNo: null,
  cancellationReason: null,
  diagnosedFault: null,
  updatedAt: '2026-09-20T00:00:00.000Z',
  notes: null,
};

function addCharge(name: string): void {
  const select = screen.getByLabelText('Add labour charge');
  // H3 — option text is now "[name] — Rs [rate]", not the bare name.
  const option = within(select).getByText<HTMLOptionElement>((content) => content.startsWith(name));
  fireEvent.change(select, { target: { value: option.value } });
  fireEvent.click(screen.getByText('Add'));
}

describe('JobDeliveryModal (F3)', () => {
  it('renders centred (Modal wrapper, not a fixed side panel) with the job number in the title', async () => {
    render(<JobDeliveryModal job={JOB} onClose={() => {}} onDelivered={() => {}} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Deliver Job JOB-0001');
    // Modal's own wrapper — fixed inset-0 + flex items-center justify-center — is
    // what makes it centred, not the old JobDeliveryDrawer's `fixed right-0` panel.
    expect(dialog.parentElement?.className).toContain('items-center');
    expect(dialog.parentElement?.className).toContain('justify-center');
  });

  it('adding two labour charges shows both lines and the Labour total reflects both; removing one updates the total', async () => {
    render(<JobDeliveryModal job={JOB} onClose={() => {}} onDelivered={() => {}} />);
    await screen.findByLabelText('Add labour charge');

    addCharge('AC Installation');
    addCharge('Gas Charging');

    expect(screen.getByRole('cell', { name: 'AC Installation' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Gas Charging' })).toBeTruthy();

    // Both lines use their default charge price (blank price field):
    // 1500 + 800 = 2300 (Money.format omits ".00" when there's no fraction).
    // Scoped to the "Labour total" row specifically — parts total is 0,
    // so "Rs 2,300" also happens to equal "Total due", appearing twice.
    const labourRow = screen.getByText('Labour total').parentElement as HTMLElement;
    expect(within(labourRow).getByText('Rs 2,300')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Remove AC Installation'));

    expect(screen.queryByRole('cell', { name: 'AC Installation' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Gas Charging' })).toBeTruthy();
    // Only Gas Charging (800) remains — total updates live.
    expect(
      within(screen.getByText('Labour total').parentElement as HTMLElement).getByText('Rs 800'),
    ).toBeTruthy();
  });
});
