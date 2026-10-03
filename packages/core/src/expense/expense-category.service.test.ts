import { describe, expect, it } from 'vitest';
import {
  assertExpenseCategoryCombinationValid,
  assertExpenseCategoryFieldsLocked,
} from './expense-category.service.js';

/**
 * P17-4 (docs/phases/PHASE_17.md §2.6/§8, Q17-5). Both functions are
 * defense-in-depth for a write path this phase's own name-only form can
 * never reach — see each function's own doc comment. Unit-tested
 * directly here, same "pure logic gets its own test, thin pass-through
 * wrappers get covered at the repository-test level" split as
 * service-charge.service.test.ts / brand.service.test.ts.
 */
describe('assertExpenseCategoryFieldsLocked (Q17-5 field-lock rule)', () => {
  it('allows any change when the category is not referenced by any expense', () => {
    expect(() => {
      assertExpenseCategoryFieldsLocked(false, { kind: 'fixed' });
    }).not.toThrow();
    expect(() => {
      assertExpenseCategoryFieldsLocked(false, {
        kind: 'fixed',
        isBillable: true,
        isOwnerDrawing: true,
      });
    }).not.toThrow();
  });

  it('allows an empty change (e.g. a name-only update) even when referenced', () => {
    expect(() => {
      assertExpenseCategoryFieldsLocked(true, {});
    }).not.toThrow();
  });

  it('rejects changing kind, isBillable, or isOwnerDrawing once referenced', () => {
    expect(() => {
      assertExpenseCategoryFieldsLocked(true, { kind: 'fixed' });
    }).toThrow('Cannot change kind');
    expect(() => {
      assertExpenseCategoryFieldsLocked(true, { isBillable: true });
    }).toThrow('Cannot change isBillable');
    expect(() => {
      assertExpenseCategoryFieldsLocked(true, { isOwnerDrawing: true });
    }).toThrow('Cannot change isOwnerDrawing');
  });

  it('names every locked field attempted at once', () => {
    expect(() => {
      assertExpenseCategoryFieldsLocked(true, { kind: 'fixed', isBillable: false });
    }).toThrow('Cannot change kind, isBillable');
  });
});

describe('assertExpenseCategoryCombinationValid (invalid-combination rules)', () => {
  it('accepts the shape every category this phase creates: not owner-drawing, not billable, direct, null parts_share_bp', () => {
    expect(() => {
      assertExpenseCategoryCombinationValid({
        isOwnerDrawing: false,
        isBillable: false,
        allocationMethod: 'direct',
        partsShareBp: null,
      });
    }).not.toThrow();
  });

  it('rejects isOwnerDrawing=true AND isBillable=true', () => {
    expect(() => {
      assertExpenseCategoryCombinationValid({
        isOwnerDrawing: true,
        isBillable: true,
        allocationMethod: 'direct',
        partsShareBp: null,
      });
    }).toThrow('owner-drawing category cannot also be billable');
  });

  it("rejects a non-null partsShareBp when allocationMethod isn't 'shared_fixed'", () => {
    expect(() => {
      assertExpenseCategoryCombinationValid({
        isOwnerDrawing: false,
        isBillable: false,
        allocationMethod: 'direct',
        partsShareBp: 5000,
      });
    }).toThrow("partsShareBp must be null unless allocationMethod is 'shared_fixed'");
  });

  it("accepts a non-null partsShareBp when allocationMethod is 'shared_fixed'", () => {
    expect(() => {
      assertExpenseCategoryCombinationValid({
        isOwnerDrawing: false,
        isBillable: false,
        allocationMethod: 'shared_fixed',
        partsShareBp: 5000,
      });
    }).not.toThrow();
  });
});
