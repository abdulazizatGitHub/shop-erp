import { ipcMain } from 'electron';
import {
  ListCashMovementsInput,
  RecordCashMovementInput,
  ReverseCashMovementInput,
  type CashMovementDto,
} from '@shop/contracts';
import type { CashMovementRecord } from '@shop/core';
import { createKyselyDb, KyselyCashMovementRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface CashMovementHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

function toDto(record: CashMovementRecord): CashMovementDto {
  return {
    id: record.id,
    docNo: record.docNo,
    movementDate: record.movementDate,
    movementType: record.movementType,
    amountPaisa: record.amountPaisa,
    note: record.note,
    reversesId: record.reversesId,
    createdAt: record.createdAt,
  };
}

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), Task 5. Extracted as plain
 * functions so they can be tested directly (matches
 * `item.handler.ts`'s `runLowStockCount`/`sale.handler.ts`'s
 * `runCreateSale` precedent) — no Electron mocking.
 */
export async function runRecordCashMovement(
  deps: CashMovementHandlerDeps,
  input: RecordCashMovementInput,
): Promise<CashMovementDto> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyCashMovementRepository(
      createKyselyDb(db),
      deps.tenantId,
      deps.deviceCode,
    );
    const record = await repo.recordMovement(input);
    return toDto(record);
  } finally {
    db.close();
  }
}

export async function runReverseCashMovement(
  deps: CashMovementHandlerDeps,
  input: ReverseCashMovementInput,
): Promise<CashMovementDto> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyCashMovementRepository(
      createKyselyDb(db),
      deps.tenantId,
      deps.deviceCode,
    );
    const record = await repo.reverseMovement(input);
    return toDto(record);
  } finally {
    db.close();
  }
}

export async function runListCashMovements(
  deps: CashMovementHandlerDeps,
  input: ListCashMovementsInput,
): Promise<readonly CashMovementDto[]> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyCashMovementRepository(
      createKyselyDb(db),
      deps.tenantId,
      deps.deviceCode,
    );
    const records = await repo.listForDateRange(input.dateFrom, input.dateTo);
    return records.map(toDto);
  } finally {
    db.close();
  }
}

/** See cash-session.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerCashMovementHandlers(deps: CashMovementHandlerDeps): void {
  ipcMain.handle(
    channels.cashMovement.record,
    withError(async (_event, raw: unknown): Promise<CashMovementDto> => {
      const input = RecordCashMovementInput.parse(raw);
      return runRecordCashMovement(deps, input);
    }),
  );

  ipcMain.handle(
    channels.cashMovement.reverse,
    withError(async (_event, raw: unknown): Promise<CashMovementDto> => {
      const input = ReverseCashMovementInput.parse(raw);
      return runReverseCashMovement(deps, input);
    }),
  );

  ipcMain.handle(
    channels.cashMovement.listForDateRange,
    withError(async (_event, raw: unknown): Promise<readonly CashMovementDto[]> => {
      const input = ListCashMovementsInput.parse(raw);
      return runListCashMovements(deps, input);
    }),
  );
}
