import { describe, it, expect } from 'vitest';
import { newId, isId, formatDocNumber, formatDisplayDocNumber } from './id.js';

describe('newId / isId', () => {
  it('generates a value that isId accepts', () => {
    expect(isId(newId())).toBe(true);
  });

  it('generates distinct, lexicographically non-decreasing ids (UUIDv7 is time-sortable)', () => {
    const ids = Array.from({ length: 5 }, () => newId());
    const unique = new Set(ids);
    expect(unique.size).toBe(5);
    // Time-sortable: string-sorting the ids must not change their generation order.
    expect([...ids].sort()).toEqual(ids);
  });

  it('rejects non-UUID strings', () => {
    expect(isId('not-a-uuid')).toBe(false);
    expect(isId('')).toBe(false);
    expect(isId('12345678-1234-1234-1234-1234567890zz')).toBe(false);
  });

  it('rejects non-string values without throwing', () => {
    expect(isId(123)).toBe(false);
    expect(isId(null)).toBe(false);
    expect(isId(undefined)).toBe(false);
    expect(isId({})).toBe(false);
  });
});

describe('formatDocNumber', () => {
  it('pads the sequence to 6 digits, matching the doc comment example', () => {
    // Documented example in id.ts: INV-A-000123
    expect(formatDocNumber('INV', 'A', 123)).toBe('INV-A-000123');
  });

  it('does not truncate a sequence longer than 6 digits', () => {
    expect(formatDocNumber('INV', 'A', 1_000_000)).toBe('INV-A-1000000');
  });

  it('pads a small sequence to full width', () => {
    expect(formatDocNumber('INV', 'A', 1)).toBe('INV-A-000001');
  });
});

describe('formatDisplayDocNumber', () => {
  it('pads a small sequence to 4 digits, no device code', () => {
    expect(formatDisplayDocNumber('INV', 1)).toBe('INV-0001');
  });

  it('does not pad a sequence of 5 or more digits — displays as-is', () => {
    expect(formatDisplayDocNumber('INV', 12345)).toBe('INV-12345');
  });

  it('pads a two-digit sequence to 4 digits', () => {
    expect(formatDisplayDocNumber('RCP', 42)).toBe('RCP-0042');
  });
});
