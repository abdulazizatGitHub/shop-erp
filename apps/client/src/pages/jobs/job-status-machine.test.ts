import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  canMarkAwaitingParts,
  canTransition,
  partIssuedTransitionTarget,
} from './job-status-machine.js';

describe('ALLOWED_TRANSITIONS (P15-6)', () => {
  it('received, diagnosed, and in_progress all allow awaiting_parts as a target', () => {
    expect(ALLOWED_TRANSITIONS.received).toContain('awaiting_parts');
    expect(ALLOWED_TRANSITIONS.diagnosed).toContain('awaiting_parts');
    expect(ALLOWED_TRANSITIONS.in_progress).toContain('awaiting_parts');
  });

  it('awaiting_parts still allows in_progress and cancelled (unchanged from P14-3)', () => {
    expect(canTransition('awaiting_parts', 'in_progress')).toBe(true);
    expect(canTransition('awaiting_parts', 'cancelled')).toBe(true);
  });
});

describe('partIssuedTransitionTarget (P15-6)', () => {
  it("returns 'in_progress' when currentStatus is 'awaiting_parts'", () => {
    expect(partIssuedTransitionTarget('awaiting_parts')).toBe('in_progress');
  });

  it("still returns 'in_progress' when currentStatus is 'received' (unchanged from P14-3)", () => {
    expect(partIssuedTransitionTarget('received')).toBe('in_progress');
  });

  it('returns null for every other status', () => {
    expect(partIssuedTransitionTarget('diagnosed')).toBeNull();
    expect(partIssuedTransitionTarget('in_progress')).toBeNull();
    expect(partIssuedTransitionTarget('ready')).toBeNull();
    expect(partIssuedTransitionTarget('delivered')).toBeNull();
    expect(partIssuedTransitionTarget('cancelled')).toBeNull();
    expect(partIssuedTransitionTarget('awaiting_approval')).toBeNull();
  });
});

describe('canMarkAwaitingParts (P15-6)', () => {
  it('returns true for received, diagnosed, and in_progress', () => {
    expect(canMarkAwaitingParts('received')).toBe(true);
    expect(canMarkAwaitingParts('diagnosed')).toBe(true);
    expect(canMarkAwaitingParts('in_progress')).toBe(true);
  });

  it('returns false for every other status', () => {
    expect(canMarkAwaitingParts('awaiting_parts')).toBe(false);
    expect(canMarkAwaitingParts('awaiting_approval')).toBe(false);
    expect(canMarkAwaitingParts('ready')).toBe(false);
    expect(canMarkAwaitingParts('delivered')).toBe(false);
    expect(canMarkAwaitingParts('cancelled')).toBe(false);
  });
});
