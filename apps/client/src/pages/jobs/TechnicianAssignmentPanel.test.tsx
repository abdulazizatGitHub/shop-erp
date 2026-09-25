// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    job: {
      listTechnicianAssignments: vi.fn(),
      assignTechnician: vi.fn(),
      unassignTechnician: vi.fn(),
    },
  },
}));

import type { JobDto, TechnicianAssignmentDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';
import { TechnicianAssignmentPanel } from './TechnicianAssignmentPanel.js';

const listTechnicianAssignments = vi.mocked(ipc.job.listTechnicianAssignments);
const unassignTechnician = vi.mocked(ipc.job.unassignTechnician);

const BASE_JOB: JobDto = {
  id: 'job-1',
  docNo: 'JOB-0001',
  customerId: null,
  customerNameAdhoc: 'Ahmad Fridge Repairs',
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
  receivedDate: '2026-09-01',
  promisedDate: null,
  estimateAmountPaisa: null,
  estimateApproved: false,
  assignedTo: 'tech-1',
  status: 'in_progress',
  businessUnitId: 'bu-repair',
  billToPartyId: null,
  revenueType: 'customer_paid',
  labourChargePaisa: 0,
  saleId: null,
  invoiceDocNo: null,
  cancellationReason: null,
  diagnosedFault: null,
  updatedAt: '2026-09-03T09:00:00.000Z',
  notes: null,
};

const TECHNICIANS = [
  { id: 'tech-1', name: 'Naeem' },
  { id: 'tech-2', name: 'Bilal' },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TechnicianAssignmentPanel (P16-3c, OD-16-5)', () => {
  it('an in_progress job allows Unassign; clicking it reveals a required reason field that blocks Confirm until filled', async () => {
    const assignments: TechnicianAssignmentDto[] = [
      {
        id: 'ta-1',
        jobId: 'job-1',
        partyId: 'tech-1',
        assignedAt: '2026-09-01T09:00:00.000Z',
        unassignedAt: null,
        unassignReason: null,
      },
    ];
    listTechnicianAssignments.mockResolvedValue(assignments);
    unassignTechnician.mockResolvedValue(undefined);

    render(
      <TechnicianAssignmentPanel job={BASE_JOB} technicians={TECHNICIANS} onJobChanged={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Unassign')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Unassign'));

    const confirmButton = await screen.findByText('Confirm unassign');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/A reason is required/)).toBeTruthy();
    });
    expect(unassignTechnician).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Removal reason'), {
      target: { value: 'Technician left the company' },
    });
    fireEvent.click(screen.getByText('Confirm unassign'));

    await waitFor(() => {
      expect(unassignTechnician).toHaveBeenCalledWith({
        id: 'ta-1',
        reason: 'Technician left the company',
      });
    });
  });

  it('a job at status "ready" locks the panel — no Unassign or Add technician controls, a short explanation shown instead', async () => {
    listTechnicianAssignments.mockResolvedValue([
      {
        id: 'ta-1',
        jobId: 'job-1',
        partyId: 'tech-1',
        assignedAt: '2026-09-01T09:00:00.000Z',
        unassignedAt: null,
        unassignReason: null,
      },
    ]);

    render(
      <TechnicianAssignmentPanel
        job={{ ...BASE_JOB, status: 'ready' }}
        technicians={TECHNICIANS}
        onJobChanged={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Naeem', { exact: false })).toBeTruthy();
    });
    expect(screen.queryByText('Unassign')).toBeNull();
    expect(screen.queryByText('+ Add technician ▾')).toBeNull();
    expect(screen.getByText(/technician list is locked/)).toBeTruthy();
  });

  it('a removed technician is shown with their removal date and reason', async () => {
    listTechnicianAssignments.mockResolvedValue([
      {
        id: 'ta-1',
        jobId: 'job-1',
        partyId: 'tech-1',
        assignedAt: '2026-09-01T09:00:00.000Z',
        unassignedAt: '2026-09-02T10:00:00.000Z',
        unassignReason: 'Reassigned to a different job',
      },
    ]);

    render(
      <TechnicianAssignmentPanel job={BASE_JOB} technicians={TECHNICIANS} onJobChanged={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Removed/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/Reason: Reassigned to a different job/)).toBeTruthy();
    // No longer listed as active — "No technicians assigned." shows instead.
    expect(screen.getByText('No technicians assigned.')).toBeTruthy();
  });
});
