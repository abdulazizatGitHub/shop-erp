import { describe, expect, it } from 'vitest';
import { SetPaymentMethodBankEnabledInput, SetPaymentMethodCashEnabledInput } from './setting.js';

/**
 * P17-7 (docs/phases/PHASE_17.md §2.6/§8, S17-EXP-4, A17-5). Only the
 * new payment-method schemas — every other schema in setting.ts had no
 * existing test file and stays untouched (CLAUDE.md §8).
 */
describe('SetPaymentMethodCashEnabledInput (A17-5 — cash can never be disabled)', () => {
  it('accepts { value: true }', () => {
    expect(() => SetPaymentMethodCashEnabledInput.parse({ value: true })).not.toThrow();
  });

  it('rejects { value: false } at the Zod boundary — this IS the enforcement the IPC handler relies on, not just the UI', () => {
    expect(() => SetPaymentMethodCashEnabledInput.parse({ value: false })).toThrow();
  });
});

describe('SetPaymentMethodBankEnabledInput (a non-cash method, both directions allowed)', () => {
  it('accepts both true and false', () => {
    expect(() => SetPaymentMethodBankEnabledInput.parse({ value: true })).not.toThrow();
    expect(() => SetPaymentMethodBankEnabledInput.parse({ value: false })).not.toThrow();
  });
});
