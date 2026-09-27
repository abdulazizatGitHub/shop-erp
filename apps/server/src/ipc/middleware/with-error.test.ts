import { afterEach, describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  AnotherSessionStillOpenError,
  MultipleOpenSessionsError,
  NegativeStockBlockedError,
  NegativeStockConfirmationRequiredError,
  SessionAlreadyOpenError,
} from '@shop/core';
import { DbBusyError } from '@shop/db';
import { toIpcError, withError } from './with-error.js';
import { setRestoreInProgress } from './restore-state.js';

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

  it('wraps a SessionAlreadyOpenError into { code: SESSION_ALREADY_OPEN, message } (PHASE_7.md P7-5)', () => {
    const error = new SessionAlreadyOpenError('2026-08-15');

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('SESSION_ALREADY_OPEN');
    expect(ipcError.message).toContain('2026-08-15');
  });

  it('wraps AnotherSessionStillOpenError into { code: ANOTHER_SESSION_STILL_OPEN, message } (Phase 17.5, review round 4 R8)', () => {
    const error = new AnotherSessionStillOpenError('2026-08-15');

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('ANOTHER_SESSION_STILL_OPEN');
    expect(ipcError.message).toContain('2026-08-15');
  });

  it('wraps MultipleOpenSessionsError into { code: MULTIPLE_OPEN_SESSIONS, message } (Phase 17.5, review round 4 R8)', () => {
    const error = new MultipleOpenSessionsError(['2026-08-15', '2026-08-16']);

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('MULTIPLE_OPEN_SESSIONS');
    expect(ipcError.message).toContain('2026-08-15');
    expect(ipcError.message).toContain('2026-08-16');
  });

  it("wraps NegativeStockBlockedError into { code: NEGATIVE_STOCK_BLOCKED, details.items } — defensive/secondary path only (P17-1 review): the real sale:create flow never lets this reach here, see sale.handler.ts's runCreateSale", () => {
    const items = [{ itemId: 'i1', name: 'Scarce Item', onHandMilli: 5000, requestedMilli: 8000 }];
    const error = new NegativeStockBlockedError(items);

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('NEGATIVE_STOCK_BLOCKED');
    expect(ipcError.details).toEqual({ items });
  });

  it('wraps NegativeStockConfirmationRequiredError into { code: NEGATIVE_STOCK_CONFIRMATION_REQUIRED, details.items } — same defensive/secondary caveat as above', () => {
    const items = [{ itemId: 'i1', name: 'Scarce Item', onHandMilli: 5000, requestedMilli: 8000 }];
    const error = new NegativeStockConfirmationRequiredError(items);

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('NEGATIVE_STOCK_CONFIRMATION_REQUIRED');
    expect(ipcError.details).toEqual({ items });
  });

  it('wraps an unknown Error into { code: INTERNAL_ERROR, message }, never a raw stack trace', () => {
    const error = new Error('Purchase 123 is already cancelled');

    const ipcError = toIpcError(error);

    expect(ipcError.code).toBe('INTERNAL_ERROR');
    expect(ipcError.message).toBe('Purchase 123 is already cancelled');
    expect('stack' in ipcError).toBe(false);
  });
});

describe('withError — restore-in-progress guard (P4-4d)', () => {
  afterEach(() => {
    setRestoreInProgress(false); // never leak state across tests
  });

  it('blocks the wrapped handler and throws RESTORE_IN_PROGRESS while a restore is running', async () => {
    let handlerWasCalled = false;
    const handler = withError(() => {
      handlerWasCalled = true;
      return Promise.resolve('should not reach here');
    });

    setRestoreInProgress(true);

    await expect(handler()).rejects.toMatchObject({ code: 'RESTORE_IN_PROGRESS' });
    expect(handlerWasCalled).toBe(false);
  });

  it('runs the wrapped handler normally when no restore is in progress', async () => {
    const handler = withError(() => Promise.resolve('normal result'));

    setRestoreInProgress(false);

    await expect(handler()).resolves.toBe('normal result');
  });
});
