const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 25;

export interface WithRetryOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
}

/**
 * Thrown after withRetry exhausts its attempts. Carries the last raw
 * SQLITE_BUSY error as `cause` (for logs) but is itself a clean,
 * serializable error — never the raw better-sqlite3 SqliteError. See
 * PROJECT.md BUG-15.
 */
export class DbBusyError extends Error {
  readonly code = 'DB_BUSY';
  readonly attempts: number;
  override readonly cause: unknown;

  constructor(attempts: number, cause: unknown) {
    super(`Database busy after ${String(attempts)} attempt(s)`);
    this.name = 'DbBusyError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

function isSqliteBusyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_BUSY'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Wraps a repository write path (a full `db.transaction().execute(fn)`
 * call) and restarts it on SQLITE_BUSY.
 *
 * `fn` is re-invoked from scratch on every retry — not just the statement
 * that threw. This is not a style choice: docs/phases/PHASE_2.md §5d
 * proves that document_sequence's read-then-write (SELECT nextNumber,
 * then UPDATE/INSERT) is safe against duplicate document numbers only
 * because a SQLITE_BUSY failure today discards the entire transaction,
 * including the already-executed SELECT. A retry that resumed with a
 * `nextNumber` already captured in JS from a stale read would silently
 * reintroduce that race. Every write-path repository method must pass
 * its whole `db.transaction().execute(async trx => {...})` closure as
 * `fn`, with nothing load-bearing left outside it.
 *
 * Non-SQLITE_BUSY errors (domain/validation errors) are never retried —
 * they propagate immediately, unwrapped.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isSqliteBusyError(error)) {
        throw error;
      }
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw new DbBusyError(maxAttempts, lastError);
}
