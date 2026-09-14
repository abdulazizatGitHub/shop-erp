import { colors } from '@shop/ui';
import { describe, expect, it } from 'vitest';
import { buildPartsLabourSlices } from './PartsLabourDonut.js';

describe('buildPartsLabourSlices (P12-3)', () => {
  it('returns both slices with Rs-formatted labels when both values are positive', () => {
    const slices = buildPartsLabourSlices(150_000, 250_000);
    expect(slices).toEqual([
      { name: 'Parts Margin (Rs 1,500)', amountRupees: 1500, fill: colors.money.in },
      { name: 'Labour Revenue (Rs 2,500)', amountRupees: 2500, fill: colors.ink.default },
    ]);
  });

  it('returns only the Parts Margin slice when labour revenue is zero', () => {
    const slices = buildPartsLabourSlices(100_000, 0);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.name).toBe('Parts Margin (Rs 1,000)');
  });

  it('returns only the Labour Revenue slice when parts margin is zero', () => {
    const slices = buildPartsLabourSlices(0, 100_000);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.name).toBe('Labour Revenue (Rs 1,000)');
  });

  it('returns no slices when both are zero', () => {
    expect(buildPartsLabourSlices(0, 0)).toEqual([]);
  });
});
