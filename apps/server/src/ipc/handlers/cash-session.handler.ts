import { ipcMain } from 'electron';
import { CloseSessionInput, OpenSessionInput, type CashSessionDto } from '@shop/contracts';
import { closeSession, getTodaySession, openSession, type CashSessionRecord } from '@shop/core';
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
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
        const record = await getTodaySession(repo, todayIso());
        return record ? toDto(record) : null;
      } finally {
        db.close();
      }
    }),
  );
}
