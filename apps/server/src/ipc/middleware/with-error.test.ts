import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { DbBusyError } from '@shop/db';
import { toIpcError } from './with-error.js';

describe('toIpcError', () => {
  it('wraps a DbBusyError into { code: DB_BUSY, message, details }', () => {
    const cause = new Error('database is locked');
    const error = new DbBusyError(5, cause);

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('DB_BUSY');
    expect(typeof ipcError.message).toBe('string');
    expect(ipcError.message.length).toBeGreaterThan(0);
    expect(ipcError.details).toBeDefined();
  });

  it('wraps a ZodError into { code: VALIDATION_ERROR, message, details }', () => {
    const schema = z.object({ name: z.string() });
    const parsed = schema.safeParse({ name: 123 });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('expected parse failure');

    const ipcError = toIpcError(parsed.error);

    expect(ipcError.code).toBe('VALIDATION_ERROR');
    expect(typeof ipcError.message).toBe('string');
    expect(ipcError.details).toBeDefined();
  });

  it('wraps an unknown Error into { code: INTERNAL_ERROR, message }, never a raw stack trace', () => {
    const error = new Error('Purchase 123 is already cancelled');

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('INTERNAL_ERROR');
    expect(ipcError.message).toBe('Purchase 123 is already cancelled');
    expect('stack' in ipcError).toBe(false);
  });
});
