import { describe, expect, it } from 'vitest';
import { distinctPayerIds, validateMultiPayerPayment } from './job-delivery.js';

describe('distinctPayerIds', () => {
  it('returns unique, non-null payer ids across part and labour lines', () => {
    const ids = distinctPayerIds([
      { payerPartyId: 'dawlance' },
      { payerPartyId: 'customer' },
      { payerPartyId: 'dawlance' },
      { payerPartyId: null },
    ]);
    expect([...ids].sort()).toEqual(['customer', 'dawlance']);
  });

  it('returns an empty array for an all-walk-in delivery', () => {
    expect(distinctPayerIds([{ payerPartyId: null }, { payerPartyId: null }])).toEqual([]);
  });
});

describe('validateMultiPayerPayment', () => {
  it('allows a single payer with a nonzero paidPaisa', () => {
    expect(() => {
      validateMultiPayerPayment(['customer'], 50000);
    }).not.toThrow();
  });

  it('allows zero payers (fully walk-in) with any paidPaisa', () => {
    expect(() => {
      validateMultiPayerPayment([], 100000);
    }).not.toThrow();
  });

  it('allows multiple payers when paidPaisa is exactly 0 (EC-2 scenario)', () => {
    expect(() => {
      validateMultiPayerPayment(['dawlance', 'customer'], 0);
    }).not.toThrow();
  });

  it('throws when multiple payers and paidPaisa > 0 — no allocation policy exists', () => {
    expect(() => {
      validateMultiPayerPayment(['dawlance', 'customer'], 1);
    }).toThrow(/multiple payers/i);
  });
});
