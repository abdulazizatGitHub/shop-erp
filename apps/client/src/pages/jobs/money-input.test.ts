import { describe, expect, it } from 'vitest';
import { sanitizeMoneyInput } from './money-input.js';

describe('sanitizeMoneyInput', () => {
  it('strips non-numeric characters', () => {
    expect(sanitizeMoneyInput('Rs 1,234')).toBe('1234');
    expect(sanitizeMoneyInput('12a3b4')).toBe('1234');
  });

  it('keeps a single decimal point', () => {
    expect(sanitizeMoneyInput('123.45')).toBe('123.45');
  });

  it('drops every decimal point after the first', () => {
    expect(sanitizeMoneyInput('1.2.3.4')).toBe('1.234');
  });

  it('passes through plain digits unchanged', () => {
    expect(sanitizeMoneyInput('500')).toBe('500');
  });

  it('handles an empty string', () => {
    expect(sanitizeMoneyInput('')).toBe('');
  });
});
