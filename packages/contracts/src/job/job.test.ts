import { describe, expect, it } from 'vitest';
import { TechnicianAssignmentDto, UnassignTechnicianInput } from './job.js';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('UnassignTechnicianInput (P16-3c, OD-16-5)', () => {
  it('accepts a valid id and a non-blank reason', () => {
    expect(() =>
      UnassignTechnicianInput.parse({ id: UUID, reason: 'Technician left the company' }),
    ).not.toThrow();
  });

  it('rejects an empty or whitespace-only reason', () => {
    expect(() => UnassignTechnicianInput.parse({ id: UUID, reason: '' })).toThrow();
    expect(() => UnassignTechnicianInput.parse({ id: UUID, reason: '   ' })).toThrow();
  });

  it('rejects a missing reason field', () => {
    expect(() => UnassignTechnicianInput.parse({ id: UUID })).toThrow();
  });

  it('trims the reason', () => {
    const parsed = UnassignTechnicianInput.parse({
      id: UUID,
      reason: '  Reassigned to another job  ',
    });
    expect(parsed.reason).toBe('Reassigned to another job');
  });

  it('rejects a non-uuid id', () => {
    expect(() =>
      UnassignTechnicianInput.parse({ id: 'not-a-uuid', reason: 'Wrong technician' }),
    ).toThrow();
  });
});

describe('TechnicianAssignmentDto (P16-3c, OD-16-5)', () => {
  it('accepts unassignReason as null (still active)', () => {
    expect(() =>
      TechnicianAssignmentDto.parse({
        id: UUID,
        jobId: UUID,
        partyId: UUID,
        assignedAt: '2026-09-24T08:00:00.000Z',
        unassignedAt: null,
        unassignReason: null,
      }),
    ).not.toThrow();
  });

  it('accepts a stored unassignReason once removed', () => {
    const parsed = TechnicianAssignmentDto.parse({
      id: UUID,
      jobId: UUID,
      partyId: UUID,
      assignedAt: '2026-09-24T08:00:00.000Z',
      unassignedAt: '2026-09-25T08:00:00.000Z',
      unassignReason: 'Technician left the company',
    });
    expect(parsed.unassignReason).toBe('Technician left the company');
  });
});
