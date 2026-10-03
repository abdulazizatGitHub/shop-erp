import { describe, expect, it } from 'vitest';
import {
  CreateExpenseCategoryInput,
  ToggleExpenseCategoryInput,
  UpdateExpenseCategoryInput,
} from './expense.js';

/**
 * P17-4 (docs/phases/PHASE_17.md §2.6, S17-EXP-1). Only the new
 * category-admin schemas — `CreateExpenseInput`/`ExpenseDto`/etc. had no
 * existing test file and stay untouched (CLAUDE.md §8 — don't fix/test
 * outside the current task).
 */
describe('CreateExpenseCategoryInput / UpdateExpenseCategoryInput (name only)', () => {
  it('accepts a plain name', () => {
    expect(() => CreateExpenseCategoryInput.parse({ name: 'Office Supplies' })).not.toThrow();
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(() => CreateExpenseCategoryInput.parse({ name: '' })).toThrow();
    expect(() => CreateExpenseCategoryInput.parse({ name: '   ' })).toThrow();
  });

  it('trims the name', () => {
    expect(CreateExpenseCategoryInput.parse({ name: '  Office Supplies  ' }).name).toBe(
      'Office Supplies',
    );
  });

  it('has no field for kind, isBillable, isOwnerDrawing, allocationMethod, or partsShareBp — an extra key is silently stripped, not an error, but never reaches the parsed result', () => {
    const parsed = CreateExpenseCategoryInput.parse({
      name: 'Office Supplies',
      kind: 'fixed',
      isBillable: true,
      isOwnerDrawing: true,
    });
    expect(parsed).toEqual({ name: 'Office Supplies' });
  });

  it('update requires a uuid id and the same name rules', () => {
    expect(() =>
      UpdateExpenseCategoryInput.parse({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Renamed',
      }),
    ).not.toThrow();
    expect(() => UpdateExpenseCategoryInput.parse({ id: 'not-a-uuid', name: 'Renamed' })).toThrow();
  });
});

describe('ToggleExpenseCategoryInput', () => {
  it('requires a uuid id and a boolean isActive', () => {
    expect(() =>
      ToggleExpenseCategoryInput.parse({
        id: '11111111-1111-1111-1111-111111111111',
        isActive: false,
      }),
    ).not.toThrow();
    expect(() => ToggleExpenseCategoryInput.parse({ id: 'not-a-uuid', isActive: true })).toThrow();
  });
});
