import { ZodError } from 'zod';
import { DbBusyError } from '@shop/db';
import { isRestoreInProgress } from './restore-state.js';

/**
 * Every error crosses the IPC boundary as this shape — never a raw stack
 * trace, never a raw better-sqlite3 SqliteError. See
 * docs/SYSTEM_DESIGN.md §5 and apps/server/src/ipc/middleware/README.md
 * ("withError: Domain error -> { code, message, details }.").
 */
export interface IpcError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export function toIpcError(error: unknown): IpcError {
  if (error instanceof DbBusyError) {
    return {
      code: 'DB_BUSY',
      message: 'The database is busy. Please try again.',
      details: { attempts: error.attempts },
    };
  }

  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input.',
      details: error.issues,
    };
  }

  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message };
  }

  return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
}

/**
 * A real Error subclass carrying the IpcError shape — `throw`-safe
 * (@typescript-eslint/only-throw-error requires an Error instance),
 * while still exposing `code`/`details` for the caller to read.
 */
export class IpcHandlerError extends Error implements IpcError {
  readonly code: string;
  readonly details?: unknown;

  constructor(ipcError: IpcError) {
    super(ipcError.message);
    this.name = 'IpcHandlerError';
    this.code = ipcError.code;
    this.details = ipcError.details;
  }
}

/**
 * Wraps an IPC handler body, catching any thrown error and re-throwing
 * the clean IpcError shape instead — the last middleware in the pipeline
 * documented in this folder's README.
 *
 * Also the P4-4d restore race guard: every handler is async (see
 * sale.handler.ts), so a call can be genuinely mid-flight — awaiting a
 * repository call — when backup:restore's file copy overwrites the live
 * .db file underneath it. While a restore is in progress, every
 * withError-wrapped handler is rejected immediately, before it opens a
 * connection, rather than left to race the file copy. See
 * restore-state.ts for the known coverage gap (a few pre-withError
 * handlers are not protected by this).
 */
export function withError<Args extends unknown[], T>(
  handler: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    if (isRestoreInProgress()) {
      throw new IpcHandlerError({
        code: 'RESTORE_IN_PROGRESS',
        message: 'A backup restore is in progress. Please wait and try again.',
      });
    }
    try {
      return await handler(...args);
    } catch (error) {
      throw new IpcHandlerError(toIpcError(error));
    }
  };
}
