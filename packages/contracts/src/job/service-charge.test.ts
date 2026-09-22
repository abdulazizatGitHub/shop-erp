import { describe, expect, it } from 'vitest';
import { CreateServiceChargeInput } from './service-charge.js';

const BASE = {
  name: 'AC Installation',
  retailChargePaisa: 300000,
};

describe('CreateServiceChargeInput — Zod-boundary half of "Zod + core" (P16-1)', () => {
  it('none: both amount and bp must be null/absent', () => {
    expect(() => CreateServiceChargeInput.parse({ ...BASE, commissionMode: 'none' })).not.toThrow();
    expect(() =>
      CreateServiceChargeInput.parse({
        ...BASE,
        commissionMode: 'none',
        commissionAmountPaisa: 100,
      }),
    ).toThrow();
  });

  it('fixed: requires a positive commissionAmountPaisa, commissionBp must be null', () => {
    expect(() =>
      CreateServiceChargeInput.parse({
        ...BASE,
        commissionMode: 'fixed',
        commissionAmountPaisa: 50000,
      }),
    ).not.toThrow();
    expect(() => CreateServiceChargeInput.parse({ ...BASE, commissionMode: 'fixed' })).toThrow();
    expect(() =>
      CreateServiceChargeInput.parse({
        ...BASE,
        commissionMode: 'fixed',
        commissionAmountPaisa: 50000,
        commissionBp: 1000,
      }),
    ).toThrow();
  });

  it('bp: requires commissionBp 1..10000, commissionAmountPaisa must be null', () => {
    expect(() =>
      CreateServiceChargeInput.parse({ ...BASE, commissionMode: 'bp', commissionBp: 1000 }),
    ).not.toThrow();
    expect(() =>
      CreateServiceChargeInput.parse({ ...BASE, commissionMode: 'bp', commissionBp: 10001 }),
    ).toThrow();
    expect(() =>
      CreateServiceChargeInput.parse({
        ...BASE,
        commissionMode: 'bp',
        commissionBp: 1000,
        commissionAmountPaisa: 100,
      }),
    ).toThrow();
  });

  it('both amount and bp set is rejected regardless of mode', () => {
    expect(() =>
      CreateServiceChargeInput.parse({
        ...BASE,
        commissionMode: 'fixed',
        commissionAmountPaisa: 50000,
        commissionBp: 1000,
      }),
    ).toThrow();
  });
});
