import { describe, expect, it } from 'vitest';
import {
  assertTechnicianListUnlocked,
  assertUnassignReasonProvided,
} from './technician-assignment.js';

describe('assertTechnicianListUnlocked — OD-16-5', () => {
  it.each(['ready', 'delivered', 'cancelled'] as const)(
    'assign on status "%s" -> throws',
    (status) => {
      expect(() => {
        assertTechnicianListUnlocked(status, 'assign');
      }).toThrow(/locked/);
    },
  );

  it.each(['ready', 'delivered', 'cancelled'] as const)(
    'unassign on status "%s" -> throws',
    (status) => {
      expect(() => {
        assertTechnicianListUnlocked(status, 'unassign');
      }).toThrow(/locked/);
    },
  );

  it.each(['received', 'diagnosed', 'awaiting_approval', 'awaiting_parts', 'in_progress'] as const)(
    'assign/unassign on status "%s" -> does not throw',
    (status) => {
      expect(() => {
        assertTechnicianListUnlocked(status, 'assign');
      }).not.toThrow();
      expect(() => {
        assertTechnicianListUnlocked(status, 'unassign');
      }).not.toThrow();
    },
  );
});

describe('assertUnassignReasonProvided', () => {
  it('a non-blank reason does not throw', () => {
    expect(() => {
      assertUnassignReasonProvided('Technician left the company');
    }).not.toThrow();
  });

  it('an empty string throws', () => {
    expect(() => {
      assertUnassignReasonProvided('');
    }).toThrow(/reason is required/);
  });

  it('a whitespace-only string throws — trimmed length must be > 0', () => {
    expect(() => {
      assertUnassignReasonProvided('   ');
    }).toThrow(/reason is required/);
  });
});
