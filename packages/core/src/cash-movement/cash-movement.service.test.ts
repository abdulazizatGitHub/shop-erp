import { describe, expect, it } from 'vitest';
import {
  CashMovementSessionClosedError,
  ReversalOfReversalError,
  type CashMovementRecord,
} from './cash-movement.repository.port.js';
import { assertCashMovementValid, assertReversalValid } from './cash-movement.service.js';

function makeOriginal(overrides: Partial<CashMovementRecord> = {}): CashMovementRecord {
  return {
    id: 'movement-1',
    docNo: 'CM-0001',
    movementDate: '2026-09-27',
    movementType: 'bank_deposit',
    amountPaisa: -1200000,
    note: 'Deposited at HBL Malakand branch',
    reversesId: null,
    createdAt: '2026-09-27T10:00:00.000Z',
    ...overrides,
  };
}

// Phase 17.5 (docs/phases/PHASE_17_5.md §4/§5 T2), ADR-0016.
describe('assertCashMovementValid', () => {
  it('rejects amount === 0 for every type', () => {
    expect(() => {
      assertCashMovementValid('bank_deposit', 0, 'note');
    }).toThrow('Cash movement amount cannot be zero.');
    expect(() => {
      assertCashMovementValid('owner_draw', 0, 'note');
    }).toThrow();
    expect(() => {
      assertCashMovementValid('float_add', 0, 'note');
    }).toThrow();
    expect(() => {
      assertCashMovementValid('other', 0, 'note');
    }).toThrow();
  });

  it('rejects a blank or whitespace-only note, regardless of type (R4 — required on every movement, not just "other")', () => {
    expect(() => {
      assertCashMovementValid('bank_deposit', -1000, '');
    }).toThrow('A note is required for every cash movement.');
    expect(() => {
      assertCashMovementValid('float_add', 1000, '   ');
    }).toThrow();
    expect(() => {
      assertCashMovementValid('other', 1000, '');
    }).toThrow();
  });

  it('bank_deposit and owner_draw must be negative — rejects a positive or zero amount', () => {
    expect(() => {
      assertCashMovementValid('bank_deposit', 1000, 'note');
    }).toThrow('"bank_deposit" must be a negative amount');
    expect(() => {
      assertCashMovementValid('owner_draw', 1000, 'note');
    }).toThrow('"owner_draw" must be a negative amount');
    expect(() => {
      assertCashMovementValid('bank_deposit', -1000, 'note');
    }).not.toThrow();
    expect(() => {
      assertCashMovementValid('owner_draw', -1000, 'note');
    }).not.toThrow();
  });

  it('float_add must be positive — rejects a negative amount', () => {
    expect(() => {
      assertCashMovementValid('float_add', -1000, 'note');
    }).toThrow('"float_add" must be a positive amount');
    expect(() => {
      assertCashMovementValid('float_add', 1000, 'note');
    }).not.toThrow();
  });

  it("'other' allows either sign", () => {
    expect(() => {
      assertCashMovementValid('other', 1000, 'note');
    }).not.toThrow();
    expect(() => {
      assertCashMovementValid('other', -1000, 'note');
    }).not.toThrow();
  });
});

describe('assertReversalValid', () => {
  it('accepts a reversal amount that is the exact negation of the original', () => {
    const original = makeOriginal({ amountPaisa: -1200000 });
    expect(() => {
      assertReversalValid(original, 1200000, original.movementDate);
    }).not.toThrow();
  });

  it('rejects a reversal amount that is not the exact negation, even by 1 paisa', () => {
    const original = makeOriginal({ amountPaisa: -1200000 });
    expect(() => {
      assertReversalValid(original, 1200001, original.movementDate);
    }).toThrow('Reversal amount must be the exact opposite');
    expect(() => {
      assertReversalValid(original, 1199999, original.movementDate);
    }).toThrow();
  });

  it('rejects reversing a row that is itself already a reversal', () => {
    const original = makeOriginal({ reversesId: 'movement-0' });
    expect(() => {
      assertReversalValid(original, 1200000, original.movementDate);
    }).toThrow(ReversalOfReversalError);
  });

  it("rejects reversing an original whose movementDate doesn't match the currently-open session — no session open at all", () => {
    const original = makeOriginal({ movementDate: '2026-09-27' });
    expect(() => {
      assertReversalValid(original, 1200000, null);
    }).toThrow(CashMovementSessionClosedError);
  });

  it("rejects reversing an original whose movementDate doesn't match the currently-open session — a different date's session is open", () => {
    const original = makeOriginal({ movementDate: '2026-09-27' });
    expect(() => {
      assertReversalValid(original, 1200000, '2026-09-28');
    }).toThrow('That day is closed');
  });

  it('accepts a reversal when the original movementDate matches the open session (same-day, still open)', () => {
    const original = makeOriginal({ movementDate: '2026-09-27' });
    expect(() => {
      assertReversalValid(original, 1200000, '2026-09-27');
    }).not.toThrow();
  });
});
