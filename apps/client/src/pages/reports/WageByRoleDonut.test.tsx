import { describe, expect, it } from 'vitest';
import type { WageMonthRowDto } from '@shop/contracts';
import { buildWageByRoleSlices } from './WageByRoleDonut.js';

function row(overrides: Partial<WageMonthRowDto> = {}): WageMonthRowDto {
  return {
    staffId: 's1',
    staffName: 'Staff',
    staffRole: 'technician',
    fullDays: 0,
    halfDays: 0,
    absentDays: 0,
    leaveDays: 0,
    holidayDays: 0,
    grossPaisa: 0,
    advancesPaisa: 0,
    commissionPaisa: 0,
    netPaisa: 0,
    ...overrides,
  };
}

describe('buildWageByRoleSlices (P12-6)', () => {
  it('sums netPaisa across multiple staff sharing one role', () => {
    const slices = buildWageByRoleSlices([
      row({ staffRole: 'technician', netPaisa: 100_000 }),
      row({ staffRole: 'technician', netPaisa: 50_000 }),
    ]);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.role).toBe('technician');
    expect(slices[0]?.amountRupees).toBe(1500);
    expect(slices[0]?.name).toBe('technician (Rs 1,500)');
  });

  it('produces one slice per distinct role', () => {
    const slices = buildWageByRoleSlices([
      row({ staffRole: 'technician', netPaisa: 100_000 }),
      row({ staffRole: 'salesman', netPaisa: 200_000 }),
    ]);
    expect(slices.map((s) => s.role)).toEqual(['technician', 'salesman']);
  });

  it('returns an empty array for no rows', () => {
    expect(buildWageByRoleSlices([])).toEqual([]);
  });
});
