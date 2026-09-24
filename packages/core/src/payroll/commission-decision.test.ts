import { describe, expect, it } from 'vitest';
import {
  assertNonBlankReason,
  isClaimPending,
  validateApprovalRecipients,
  type RecipientInput,
  type RecipientPartyInfo,
} from './commission-decision.js';

const ACTIVE_STAFF: RecipientPartyInfo = { partyType: 'staff', isActive: true };
const INACTIVE_STAFF: RecipientPartyInfo = { partyType: 'staff', isActive: false };
const CUSTOMER: RecipientPartyInfo = { partyType: 'customer', isActive: true };

function lookupFrom(map: Record<string, RecipientPartyInfo>) {
  return (id: string): RecipientPartyInfo | undefined => map[id];
}

describe('validateApprovalRecipients — OD-16-3/OD-16-12', () => {
  it('no recipients -> throws', () => {
    expect(() => {
      validateApprovalRecipients([], new Set(), lookupFrom({}));
    }).toThrow(/at least one recipient/);
  });

  it('a single in-history active staff recipient with amount > 0 -> does not throw', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'T1', amountPaisa: 50000, outsideHistoryReason: null },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(['T1']), lookupFrom({ T1: ACTIVE_STAFF }));
    }).not.toThrow();
  });

  it('the same technician listed twice -> throws', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'T1', amountPaisa: 30000, outsideHistoryReason: null },
      { technicianPartyId: 'T1', amountPaisa: 20000, outsideHistoryReason: null },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(['T1']), lookupFrom({ T1: ACTIVE_STAFF }));
    }).toThrow(/listed more than once/);
  });

  it('amountPaisa <= 0 -> throws', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'T1', amountPaisa: 0, outsideHistoryReason: null },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(['T1']), lookupFrom({ T1: ACTIVE_STAFF }));
    }).toThrow(/amount must be > 0/);
  });

  it('a non-staff party as recipient -> rejected outright, reason or not (OD-16-12)', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'C1', amountPaisa: 50000, outsideHistoryReason: 'trusted friend' },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(), lookupFrom({ C1: CUSTOMER }));
    }).toThrow(/must be an active staff party/);
  });

  it('an inactive staff party as recipient -> rejected', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'T1', amountPaisa: 50000, outsideHistoryReason: null },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(['T1']), lookupFrom({ T1: INACTIVE_STAFF }));
    }).toThrow(/must be an active staff party/);
  });

  it('an unknown party id as recipient -> rejected (treated as not staff)', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'ghost', amountPaisa: 50000, outsideHistoryReason: null },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(), lookupFrom({}));
    }).toThrow(/must be an active staff party/);
  });

  it('a recipient not in the job history, with no outsideHistoryReason -> rejected (OD-16-12)', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'T2', amountPaisa: 50000, outsideHistoryReason: null },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(['T1']), lookupFrom({ T2: ACTIVE_STAFF }));
    }).toThrow(/outsideHistoryReason/);
  });

  it('a recipient not in the job history, with a whitespace-only outsideHistoryReason -> rejected (trimmed length must be > 0)', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'T2', amountPaisa: 50000, outsideHistoryReason: '   ' },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(['T1']), lookupFrom({ T2: ACTIVE_STAFF }));
    }).toThrow(/outsideHistoryReason/);
  });

  it('a recipient not in the job history, with a non-blank trimmed outsideHistoryReason -> accepted (OD-16-12)', () => {
    const recipients: RecipientInput[] = [
      {
        technicianPartyId: 'T2',
        amountPaisa: 50000,
        outsideHistoryReason: 'Senior technician covered for T1 on this job',
      },
    ];
    expect(() => {
      validateApprovalRecipients(recipients, new Set(['T1']), lookupFrom({ T2: ACTIVE_STAFF }));
    }).not.toThrow();
  });

  it('two recipients, 30000 + 20000, both in history -> does not throw', () => {
    const recipients: RecipientInput[] = [
      { technicianPartyId: 'T1', amountPaisa: 30000, outsideHistoryReason: null },
      { technicianPartyId: 'T2', amountPaisa: 20000, outsideHistoryReason: null },
    ];
    expect(() => {
      validateApprovalRecipients(
        recipients,
        new Set(['T1', 'T2']),
        lookupFrom({ T1: ACTIVE_STAFF, T2: ACTIVE_STAFF }),
      );
    }).not.toThrow();
  });
});

describe('assertNonBlankReason', () => {
  it('a non-blank reason does not throw', () => {
    expect(() => {
      assertNonBlankReason('Wrong amount entered', 'reversal reason');
    }).not.toThrow();
  });

  it('an empty string throws', () => {
    expect(() => {
      assertNonBlankReason('', 'reject reason');
    }).toThrow(/reject reason/);
  });

  it('a whitespace-only string throws — trimmed length must be > 0', () => {
    expect(() => {
      assertNonBlankReason('   ', 'reject reason');
    }).toThrow(/reject reason/);
  });
});

describe('isClaimPending — OD-16-3a', () => {
  it('no decision yet -> pending', () => {
    expect(isClaimPending(undefined)).toBe(true);
  });

  it('latest decision has a reversal -> pending', () => {
    expect(isClaimPending({ hasReversal: true })).toBe(true);
  });

  it('latest decision has no reversal -> not pending', () => {
    expect(isClaimPending({ hasReversal: false })).toBe(false);
  });
});
