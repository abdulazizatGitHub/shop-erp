import { describe, expect, it } from 'vitest';
import { CreateBrandInput, ToggleBrandInput } from './brand.js';

describe('CreateBrandInput (P16-2)', () => {
  it('accepts a plain name', () => {
    expect(() => CreateBrandInput.parse({ name: 'Midea' })).not.toThrow();
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(() => CreateBrandInput.parse({ name: '' })).toThrow();
    expect(() => CreateBrandInput.parse({ name: '   ' })).toThrow();
  });

  it('trims the name', () => {
    expect(CreateBrandInput.parse({ name: '  Midea  ' }).name).toBe('Midea');
  });
});

describe('ToggleBrandInput (P16-2)', () => {
  it('requires a uuid id and a boolean isActive', () => {
    expect(() =>
      ToggleBrandInput.parse({ id: '11111111-1111-1111-1111-111111111111', isActive: false }),
    ).not.toThrow();
    expect(() => ToggleBrandInput.parse({ id: 'not-a-uuid', isActive: true })).toThrow();
  });
});
