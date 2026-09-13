import { describe, expect, it } from 'vitest';
import { getThisMonth, getThisQuarter, getThisWeek, getThisYear, getToday } from './dateRanges.js';

// Fixed reference date for every test — 2026-09-13 is a Sunday.
const REFERENCE = new Date('2026-09-13');

describe('dateRanges (P10-3)', () => {
  it('getToday: from and to are both the reference date', () => {
    expect(getToday(REFERENCE)).toEqual({ from: '2026-09-13', to: '2026-09-13' });
  });

  it('getThisWeek: Monday-to-Sunday ISO week', () => {
    // 2026-09-07 is the Monday of this week
    expect(getThisWeek(REFERENCE)).toEqual({ from: '2026-09-07', to: '2026-09-13' });
  });

  it('getThisMonth: first to last day of September 2026', () => {
    expect(getThisMonth(REFERENCE)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('getThisQuarter: September falls in Q3 (Jul-Sep)', () => {
    expect(getThisQuarter(REFERENCE)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
  });

  it('getThisYear: Jan 1 to Dec 31 of 2026', () => {
    expect(getThisYear(REFERENCE)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});
