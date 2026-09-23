import { describe, expect, it } from 'vitest';
import { normalizeBrandName } from './brand.service.js';

describe('normalizeBrandName — OD-16-6 "trimmed, internal spaces collapsed"', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeBrandName('  Haier  ')).toBe('Haier');
  });

  it('collapses internal runs of whitespace to a single space', () => {
    expect(normalizeBrandName('Changhong   Ruba')).toBe('Changhong Ruba');
  });

  it('never touches case', () => {
    expect(normalizeBrandName('hAIER')).toBe('hAIER');
  });
});
