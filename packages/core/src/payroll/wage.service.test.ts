import { describe, expect, it } from 'vitest';
import { computeDayWage } from './wage.service.js';

describe('computeDayWage — PHASE_7.md §5 multiplier table', () => {
  const wageRatePaisa = 60000; // Rs 600/day

  it('present -> full day: 60000', () => {
    expect(computeDayWage('present', wageRatePaisa)).toBe(60000);
  });

  it('half_day -> half day, floored: floor(60000 / 2) = 30000', () => {
    expect(computeDayWage('half_day', wageRatePaisa)).toBe(30000);
  });

  it('leave -> unpaid: 0', () => {
    expect(computeDayWage('leave', wageRatePaisa)).toBe(0);
  });

  it('holiday -> full day, paid: 60000', () => {
    expect(computeDayWage('holiday', wageRatePaisa)).toBe(60000);
  });

  it('absent -> 0', () => {
    expect(computeDayWage('absent', wageRatePaisa)).toBe(0);
  });

  it('half_day with an odd rate truncates, never rounds: floor(60001 / 2) = floor(30000.5) = 30000', () => {
    expect(computeDayWage('half_day', 60001)).toBe(30000);
  });
});
