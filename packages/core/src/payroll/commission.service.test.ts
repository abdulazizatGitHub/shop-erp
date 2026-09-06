import { describe, expect, it } from 'vitest';
import { computeCommission } from './commission.service.js';

describe('computeCommission — PHASE_7.md §5 Conflict 3', () => {
  it('10% of Rs 1,200 labour: FLOOR(120000 x 1000 / 10000) = FLOOR(12000) = 12000', () => {
    expect(computeCommission(120000, 1000)).toBe(12000);
  });

  it('5% of Rs 1,500 labour: FLOOR(150000 x 500 / 10000) = FLOOR(7500) = 7500', () => {
    expect(computeCommission(150000, 500)).toBe(7500);
  });

  it('commissionBp = 0: always 0 regardless of labour total (guard — no insert should follow)', () => {
    expect(computeCommission(120000, 0)).toBe(0);
    expect(computeCommission(999999, 0)).toBe(0);
  });

  it('sub-paisa edge: FLOOR(1 x 1000 / 10000) = FLOOR(0.1) = 0', () => {
    expect(computeCommission(1, 1000)).toBe(0);
  });

  it('3.33% of Rs 1,000 labour: FLOOR(100000 x 333 / 10000) = FLOOR(3330) = 3330', () => {
    expect(computeCommission(100000, 333)).toBe(3330);
  });
});
