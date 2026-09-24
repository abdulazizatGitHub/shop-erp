import { describe, expect, it } from 'vitest';
import { computeSuggestedCommissionPaisa, suggestCommissionRecipient } from './commission-claim.js';

describe('computeSuggestedCommissionPaisa — P16-3a §4 hand-calculated values', () => {
  it("fixed: 50000 paisa, quantityMilli=1000 (the real delivery path's only value) -> 50000", () => {
    expect(computeSuggestedCommissionPaisa('fixed', 50000, null, 300000, 1000)).toBe(50000);
  });

  it('fixed: 50000 paisa, quantityMilli=2000 (pure-function-only case) -> FLOOR(50000*2000/1000) = 100000', () => {
    expect(computeSuggestedCommissionPaisa('fixed', 50000, null, 300000, 2000)).toBe(100000);
  });

  it('bp: 1000bp on a charged (operator-overridden) 400000 paisa -> FLOOR(400000*1000/10000) = 40000', () => {
    expect(computeSuggestedCommissionPaisa('bp', null, 1000, 400000, 1000)).toBe(40000);
  });

  it('bp: 1234bp on 99999 paisa -> FLOOR(99999*1234/10000) = FLOOR(12339.8766) = 12339, not 12340', () => {
    expect(computeSuggestedCommissionPaisa('bp', null, 1234, 99999, 1000)).toBe(12339);
  });

  it('mode "none" -> null (no claim at all, not a zero-amount claim)', () => {
    expect(computeSuggestedCommissionPaisa('none', null, null, 300000, 1000)).toBeNull();
  });

  it('fixed with a null commissionAmountPaisa throws — an invalid service_charge row should never reach here', () => {
    expect(() => computeSuggestedCommissionPaisa('fixed', null, null, 300000, 1000)).toThrow();
  });

  it('bp with a null commissionBp throws — an invalid service_charge row should never reach here', () => {
    expect(() => computeSuggestedCommissionPaisa('bp', null, null, 300000, 1000)).toThrow();
  });
});

describe('suggestCommissionRecipient — OD-16-2', () => {
  it('technician A assigned first then removed, B assigned after and still active -> suggests B, not A, not job.assignedTo', () => {
    const result = suggestCommissionRecipient([
      {
        id: '00000000-0000-7000-8000-00000000000a',
        technicianPartyId: 'A',
        assignedAt: '2026-09-20T10:00:00.000Z',
        unassignedAt: '2026-09-21T10:00:00.000Z',
      },
      {
        id: '00000000-0000-7000-8000-00000000000b',
        technicianPartyId: 'B',
        assignedAt: '2026-09-21T11:00:00.000Z',
        unassignedAt: null,
      },
    ]);
    expect(result).toBe('B');
  });

  it('no technician active on the job at delivery time -> null', () => {
    const result = suggestCommissionRecipient([
      {
        id: '00000000-0000-7000-8000-00000000000a',
        technicianPartyId: 'A',
        assignedAt: '2026-09-20T10:00:00.000Z',
        unassignedAt: '2026-09-21T10:00:00.000Z',
      },
    ]);
    expect(result).toBeNull();
  });

  it('no assignments at all -> null', () => {
    expect(suggestCommissionRecipient([])).toBeNull();
  });

  it('two technicians both still active -> the earliest-assigned one, not assignment-array order', () => {
    const result = suggestCommissionRecipient([
      {
        id: '00000000-0000-7000-8000-00000000000b',
        technicianPartyId: 'later',
        assignedAt: '2026-09-21T09:00:00.000Z',
        unassignedAt: null,
      },
      {
        id: '00000000-0000-7000-8000-00000000000a',
        technicianPartyId: 'earlier',
        assignedAt: '2026-09-20T09:00:00.000Z',
        unassignedAt: null,
      },
    ]);
    expect(result).toBe('earlier');
  });

  it('two technicians both active with identical assignedAt -> ties break on the smaller job_technician id, regardless of input order', () => {
    const smallerId = '00000000-0000-7000-8000-000000000001';
    const largerId = '00000000-0000-7000-8000-000000000002';
    const sameTimestamp = '2026-09-21T09:00:00.000Z';

    const resultLargerFirst = suggestCommissionRecipient([
      { id: largerId, technicianPartyId: 'larger', assignedAt: sameTimestamp, unassignedAt: null },
      {
        id: smallerId,
        technicianPartyId: 'smaller',
        assignedAt: sameTimestamp,
        unassignedAt: null,
      },
    ]);
    expect(resultLargerFirst).toBe('smaller');

    const resultSmallerFirst = suggestCommissionRecipient([
      {
        id: smallerId,
        technicianPartyId: 'smaller',
        assignedAt: sameTimestamp,
        unassignedAt: null,
      },
      { id: largerId, technicianPartyId: 'larger', assignedAt: sameTimestamp, unassignedAt: null },
    ]);
    expect(resultSmallerFirst).toBe('smaller');
  });
});
