import { describe, it, expect, vi } from 'vitest';
import { withRetry, DbBusyError } from './retry.js';

/**
 * A SqliteError-shaped object, duck-typed the same way
 * purchase.repository.test.ts checks the real thing: `.code`, not the
 * message text. See docs/phases/PHASE_2.md §5c.
 */
function busyError(): Error & { code: string } {
  const error = new Error('database is locked') as Error & { code: string };
  error.code = 'SQLITE_BUSY';
  return error;
}

describe('withRetry', () => {
  it('resolves on the first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once and succeeds after a single SQLITE_BUSY', async () => {
    const fn = vi.fn().mockRejectedValueOnce(busyError()).mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 });

    // Every retry re-invokes fn from scratch — this is the whole point:
    // fn contains every read (including a document_sequence lookup) as
    // well as every write, so a restart never resumes with a stale
    // in-JS value. See PROJECT.md BUG-15's binding design constraint.
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-SQLITE_BUSY error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Purchase already cancelled'));

    await expect(withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })).rejects.toThrow(
      'Purchase already cancelled',
    );
    // A business-rule error is not a contention error — retrying it would
    // be wrong, not just wasteful.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts and throws a clean typed error, never the raw SqliteError', async () => {
    const fn = vi.fn().mockRejectedValue(busyError());

    const rejection: unknown = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 }).catch(
      (error: unknown) => error,
    );

    expect(fn).toHaveBeenCalledTimes(3);
    expect(rejection).toBeInstanceOf(DbBusyError);
    const dbBusyError = rejection as DbBusyError;
    expect(dbBusyError.code).toBe('DB_BUSY');
    // The raw driver message ("database is locked") must not be the
    // top-level thrown message — only reachable via .cause.
    expect(dbBusyError.message).not.toBe('database is locked');
    expect(dbBusyError.cause).toBeInstanceOf(Error);
    expect((dbBusyError.cause as Error).message).toBe('database is locked');
  });
});
