import { ipcMain } from 'electron';
import {
  CloseSessionInput,
  OpenSessionInput,
  SetCashSessionNoteInput,
  type CashSessionDto,
} from '@shop/contracts';
import { closeSession, getOpenSession, openSession, type CashSessionRecord } from '@shop/core';
import { createKyselyDb, KyselyCashSessionRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface CashSessionHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

function toDto(record: CashSessionRecord): CashSessionDto {
  return {
    id: record.id,
    sessionDate: record.sessionDate,
    openedAt: record.openedAt,
    closedAt: record.closedAt,
    openingCash: record.openingCashPaisa,
    expectedCash: record.expectedCashPaisa,
    countedCash: record.countedCashPaisa,
    difference: record.differencePaisa,
    status: record.status,
    notes: record.notes,
  };
}

/**
 * Review round 7 follow-up (docs/phases/PHASE_17_5.md). Exported as a
 * plain function — same "opens/closes its own connection, testable
 * without mocking Electron" precedent as cash-movement.handler.ts's
 * runRecordCashMovement, unlike this file's other two handlers.
 */
export async function runSetCashSessionNote(
  deps: CashSessionHandlerDeps,
  input: SetCashSessionNoteInput,
): Promise<CashSessionDto> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyCashSessionRepository(
      createKyselyDb(db),
      deps.tenantId,
      deps.deviceCode,
    );
    const record = await repo.setSessionNote({ sessionId: input.sessionId, note: input.note });
    return toDto(record);
  } finally {
    db.close();
  }
}

/** See staff.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerCashSessionHandlers(deps: CashSessionHandlerDeps): void {
  ipcMain.handle(
    channels.cashSession.open,
    withError(async (_event, raw: unknown): Promise<CashSessionDto> => {
      const input = OpenSessionInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCashSessionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        const record = await openSession(repo, input);
        return toDto(record);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.cashSession.close,
    withError(async (_event, raw: unknown): Promise<CashSessionDto> => {
      const input = CloseSessionInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCashSessionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        const record = await closeSession(repo, input);
        return toDto(record);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.cashSession.today,
    withError(async (): Promise<CashSessionDto | null> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCashSessionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        // Phase 17.5, review round 4 R8: the currently OPEN session,
        // never "today's" — a session opened on an earlier date and
        // never closed must still show here (BUG-33, PROJECT.md).
        const record = await getOpenSession(repo);
        return record ? toDto(record) : null;
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.cashSession.setNote,
    withError(async (_event, raw: unknown): Promise<CashSessionDto> => {
      const input = SetCashSessionNoteInput.parse(raw);
      return runSetCashSessionNote(deps, input);
    }),
  );
}
