import { describe, expect, it } from 'vitest';
import {
  ApproveClaimInput,
  ApproveClaimRecipientInput,
  GetClaimDetailInput,
  RejectClaimInput,
  ReverseDecisionInput,
} from './commission-decision.js';

const UUID = '11111111-1111-1111-1111-111111111111';
const UUID_2 = '22222222-2222-2222-2222-222222222222';

describe('ApproveClaimRecipientInput (P16-3a Checkpoint 2)', () => {
  it('accepts a valid in-history recipient (outsideHistoryReason: null)', () => {
    expect(() =>
      ApproveClaimRecipientInput.parse({
        technicianPartyId: UUID,
        amountPaisa: 50000,
        outsideHistoryReason: null,
      }),
    ).not.toThrow();
  });

  it('rejects a non-uuid technicianPartyId', () => {
    expect(() =>
      ApproveClaimRecipientInput.parse({
        technicianPartyId: 'not-a-uuid',
        amountPaisa: 50000,
        outsideHistoryReason: null,
      }),
    ).toThrow();
  });

  it('rejects amountPaisa <= 0', () => {
    expect(() =>
      ApproveClaimRecipientInput.parse({
        technicianPartyId: UUID,
        amountPaisa: 0,
        outsideHistoryReason: null,
      }),
    ).toThrow();
    expect(() =>
      ApproveClaimRecipientInput.parse({
        technicianPartyId: UUID,
        amountPaisa: -1,
        outsideHistoryReason: null,
      }),
    ).toThrow();
  });

  it('rejects a non-integer amountPaisa', () => {
    expect(() =>
      ApproveClaimRecipientInput.parse({
        technicianPartyId: UUID,
        amountPaisa: 500.5,
        outsideHistoryReason: null,
      }),
    ).toThrow();
  });

  it('rejects a whitespace-only outsideHistoryReason — trimmed length must be > 0', () => {
    expect(() =>
      ApproveClaimRecipientInput.parse({
        technicianPartyId: UUID,
        amountPaisa: 50000,
        outsideHistoryReason: '   ',
      }),
    ).toThrow();
  });

  it('accepts and trims a non-blank outsideHistoryReason', () => {
    const parsed = ApproveClaimRecipientInput.parse({
      technicianPartyId: UUID,
      amountPaisa: 50000,
      outsideHistoryReason: '  Senior technician covered this job  ',
    });
    expect(parsed.outsideHistoryReason).toBe('Senior technician covered this job');
  });

  it('rejects a missing outsideHistoryReason field (must be explicit null or a string, not undefined)', () => {
    expect(() =>
      ApproveClaimRecipientInput.parse({ technicianPartyId: UUID, amountPaisa: 50000 }),
    ).toThrow();
  });
});

describe('ApproveClaimInput (P16-3a Checkpoint 2)', () => {
  const validRecipient = {
    technicianPartyId: UUID,
    amountPaisa: 50000,
    outsideHistoryReason: null,
  };

  it('accepts one recipient', () => {
    expect(() =>
      ApproveClaimInput.parse({
        claimId: UUID_2,
        recipients: [validRecipient],
        decidedAt: '2026-09-25',
      }),
    ).not.toThrow();
  });

  it('accepts two recipients (30000 + 20000 split)', () => {
    expect(() =>
      ApproveClaimInput.parse({
        claimId: UUID_2,
        recipients: [
          { technicianPartyId: UUID, amountPaisa: 30000, outsideHistoryReason: null },
          { technicianPartyId: UUID_2, amountPaisa: 20000, outsideHistoryReason: null },
        ],
        decidedAt: '2026-09-25',
      }),
    ).not.toThrow();
  });

  it('rejects an empty recipients array', () => {
    expect(() =>
      ApproveClaimInput.parse({ claimId: UUID_2, recipients: [], decidedAt: '2026-09-25' }),
    ).toThrow();
  });

  it('rejects a non-uuid claimId', () => {
    expect(() =>
      ApproveClaimInput.parse({
        claimId: 'not-a-uuid',
        recipients: [validRecipient],
        decidedAt: '2026-09-25',
      }),
    ).toThrow();
  });

  it('rejects an empty decidedAt', () => {
    expect(() =>
      ApproveClaimInput.parse({ claimId: UUID_2, recipients: [validRecipient], decidedAt: '' }),
    ).toThrow();
  });
});

describe('RejectClaimInput (P16-3a Checkpoint 2)', () => {
  it('accepts a valid claimId and a non-blank reason', () => {
    expect(() =>
      RejectClaimInput.parse({
        claimId: UUID,
        reason: 'Suggested amount looks wrong',
        decidedAt: '2026-09-25',
      }),
    ).not.toThrow();
  });

  it('rejects an empty or whitespace-only reason', () => {
    expect(() =>
      RejectClaimInput.parse({ claimId: UUID, reason: '', decidedAt: '2026-09-25' }),
    ).toThrow();
    expect(() =>
      RejectClaimInput.parse({ claimId: UUID, reason: '   ', decidedAt: '2026-09-25' }),
    ).toThrow();
  });

  it('trims the reason', () => {
    const parsed = RejectClaimInput.parse({
      claimId: UUID,
      reason: '  Not a real commission case  ',
      decidedAt: '2026-09-25',
    });
    expect(parsed.reason).toBe('Not a real commission case');
  });

  it('rejects a non-uuid claimId', () => {
    expect(() =>
      RejectClaimInput.parse({ claimId: 'not-a-uuid', reason: 'Wrong', decidedAt: '2026-09-25' }),
    ).toThrow();
  });
});

describe('ReverseDecisionInput (P16-3a Checkpoint 2)', () => {
  it('accepts a valid decisionId and a non-blank reason', () => {
    expect(() =>
      ReverseDecisionInput.parse({
        decisionId: UUID,
        reason: 'Wrong technician selected',
        reversedAt: '2026-09-26',
      }),
    ).not.toThrow();
  });

  it('rejects an empty or whitespace-only reason', () => {
    expect(() =>
      ReverseDecisionInput.parse({ decisionId: UUID, reason: '', reversedAt: '2026-09-26' }),
    ).toThrow();
    expect(() =>
      ReverseDecisionInput.parse({ decisionId: UUID, reason: '   ', reversedAt: '2026-09-26' }),
    ).toThrow();
  });

  it('rejects a non-uuid decisionId', () => {
    expect(() =>
      ReverseDecisionInput.parse({
        decisionId: 'not-a-uuid',
        reason: 'Wrong',
        reversedAt: '2026-09-26',
      }),
    ).toThrow();
  });
});

describe('GetClaimDetailInput (P16-3a Checkpoint 2)', () => {
  it('accepts a valid uuid claimId', () => {
    expect(() => GetClaimDetailInput.parse({ claimId: UUID })).not.toThrow();
  });

  it('rejects a non-uuid claimId', () => {
    expect(() => GetClaimDetailInput.parse({ claimId: 'not-a-uuid' })).toThrow();
  });
});
