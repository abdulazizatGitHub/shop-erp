import { describe, expect, it } from 'vitest';
import type { JobDto, JobStatusHistoryDto, TechnicianAssignmentDto } from '@shop/contracts';
import type { JobPartRecord } from '../../types/electron-api.js';
import { buildHistoryEvents, formatEventTimestamp } from './job-history-events.js';

const BASE_JOB: JobDto = {
  id: 'job-1',
  docNo: 'JOB-0001',
  customerId: null,
  customerNameAdhoc: 'Ahmad Fridge Repairs',
  customerPhone: null,
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
  status: 'diagnosed',
  businessUnitId: 'bu-repair',
  billToPartyId: null,
  revenueType: 'customer_paid',
  labourChargePaisa: 0,
  saleId: null,
  invoiceDocNo: null,
  cancellationReason: null,
  diagnosedFault: 'Compressor relay burnt out',
  updatedAt: '2026-09-03T09:00:00.000Z',
};

describe('buildHistoryEvents', () => {
  it('produces a full lifecycle in chronological order with the exact required strings', () => {
    const statusHistory: JobStatusHistoryDto[] = [
      { fromStatus: null, toStatus: 'received', changedAt: '2026-09-01T09:00:00.000Z' },
      { fromStatus: 'received', toStatus: 'in_progress', changedAt: '2026-09-01T10:00:00.000Z' },
      { fromStatus: 'in_progress', toStatus: 'diagnosed', changedAt: '2026-09-02T11:00:00.000Z' },
    ];
    const technicianAssignments: TechnicianAssignmentDto[] = [
      {
        id: 'ta-1',
        jobId: 'job-1',
        partyId: 'tech-1',
        assignedAt: '2026-09-01T09:05:00.000Z',
        unassignedAt: null,
      },
      {
        id: 'ta-2',
        jobId: 'job-1',
        partyId: 'tech-2',
        assignedAt: '2026-09-01T09:06:00.000Z',
        unassignedAt: '2026-09-02T12:00:00.000Z',
      },
    ];
    const parts: JobPartRecord[] = [
      {
        id: 'jp-1',
        itemId: 'item-1',
        itemName: 'Compressor 1.5T',
        quantityMilli: 1000,
        unitCostPaisa: 500000,
        unitPricePaisa: 650000,
        entryType: 'issue',
        reversesJobPartId: null,
        isBillable: true,
        issuedAt: '2026-09-01T10:30:00.000Z',
      },
    ];

    const events = buildHistoryEvents({
      job: BASE_JOB,
      parts,
      statusHistory,
      technicianAssignments,
      technicianNames: { 'tech-1': 'Naeem', 'tech-2': 'Hassan' },
    });

    expect(events.map((e) => e.description)).toEqual([
      'Job received',
      'Naeem assigned',
      'Hassan assigned',
      'Status changed to In Progress',
      '1 × Compressor 1.5T issued to job',
      'Diagnosis recorded: Compressor relay burnt out',
      'Hassan unassigned',
    ]);
    // Sorted ascending — every timestamp must be <= the next.
    const timestamps = events.map((e) => e.timestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a.localeCompare(b)));
  });

  it('truncates a long diagnosedFault to 60 chars with an ellipsis', () => {
    const longFault = 'A'.repeat(80);
    const events = buildHistoryEvents({
      job: { ...BASE_JOB, diagnosedFault: longFault },
      parts: [],
      statusHistory: [],
      technicianAssignments: [],
      technicianNames: {},
    });
    const diagEvent = events.find((e) => e.description.startsWith('Diagnosis recorded:'));
    expect(diagEvent?.description).toBe(`Diagnosis recorded: ${'A'.repeat(60)}…`);
  });

  it('falls back to job.updatedAt when diagnosedFault is set but no diagnosed history row exists', () => {
    const events = buildHistoryEvents({
      job: BASE_JOB,
      parts: [],
      statusHistory: [],
      technicianAssignments: [],
      technicianNames: {},
    });
    expect(events).toEqual([
      {
        timestamp: BASE_JOB.updatedAt,
        description: 'Diagnosis recorded: Compressor relay burnt out',
      },
    ]);
  });

  it('shows "Job cancelled — [reason label]" using the reused CANCELLATION_REASON_LABELS map', () => {
    const events = buildHistoryEvents({
      job: {
        ...BASE_JOB,
        status: 'cancelled',
        diagnosedFault: null,
        cancellationReason: 'unrepairable',
      },
      parts: [],
      statusHistory: [
        { fromStatus: 'in_progress', toStatus: 'cancelled', changedAt: '2026-09-04T08:00:00.000Z' },
      ],
      technicianAssignments: [],
      technicianNames: {},
    });
    expect(events).toEqual([
      { timestamp: '2026-09-04T08:00:00.000Z', description: 'Job cancelled — Unrepairable' },
    ]);
  });

  it('shows "Job delivered — Invoice [docNo]" using the invoice doc number', () => {
    const events = buildHistoryEvents({
      job: { ...BASE_JOB, status: 'delivered', diagnosedFault: null, invoiceDocNo: 'INV-0042' },
      parts: [],
      statusHistory: [
        { fromStatus: 'ready', toStatus: 'delivered', changedAt: '2026-09-05T14:00:00.000Z' },
      ],
      technicianAssignments: [],
      technicianNames: {},
    });
    expect(events).toEqual([
      { timestamp: '2026-09-05T14:00:00.000Z', description: 'Job delivered — Invoice INV-0042' },
    ]);
  });

  it('renders a returned part with the exact required string', () => {
    const events = buildHistoryEvents({
      job: { ...BASE_JOB, diagnosedFault: null },
      parts: [
        {
          id: 'jp-2',
          itemId: 'item-1',
          itemName: 'Compressor 1.5T',
          quantityMilli: 500,
          unitCostPaisa: 500000,
          unitPricePaisa: 650000,
          entryType: 'return',
          reversesJobPartId: 'jp-1',
          isBillable: true,
          issuedAt: '2026-09-06T10:00:00.000Z',
        },
      ],
      statusHistory: [],
      technicianAssignments: [],
      technicianNames: {},
    });
    expect(events).toEqual([
      {
        timestamp: '2026-09-06T10:00:00.000Z',
        description: '0.5 × Compressor 1.5T returned from job',
      },
    ]);
  });
});

describe('formatEventTimestamp', () => {
  it('formats as "D MMM YYYY, HH:mm"', () => {
    // A fixed UTC instant; asserting the overall shape rather than a
    // specific local hour, since Intl.DateTimeFormat with no timeZone
    // renders in the host's local time (correct behaviour, not a bug).
    const formatted = formatEventTimestamp('2026-09-20T14:30:00.000Z');
    // en-GB abbreviates some months to 4 letters (e.g. "Sept"), not always 3.
    expect(formatted).toMatch(/^\d{1,2} [A-Za-z]{3,4} 2026, \d{2}:\d{2}$/);
  });
});
