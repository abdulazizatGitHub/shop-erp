import { ipcMain } from 'electron';
import { ImportOpeningStockInput } from '@shop/contracts';
import {
  formatOpeningStockImportReport,
  OPENING_STOCK_COLUMNS,
  parseCsv,
  validateOpeningStockRows,
} from '@shop/core';
import { createKyselyDb, KyselyImportRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { writeReportDual } from './report-writer.js';

export interface OpeningStockImportHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
  readonly logDir: string;
}

export interface OpeningStockImportResult {
  readonly reportPath: string;
  readonly logReportPath: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
}

/**
 * Opening Stock CSV import — its own channel, separate from Items import
 * (Session 52, owner decision: separate buttons, separate modals, separate
 * IPC). Matches items already committed to the DB by item code; an item
 * that would be newly created in the same pass by an Items import won't be
 * found yet — a real limitation of the two sheets being separate imports
 * now, not a bug.
 */
export async function runOpeningStockImport(
  deps: OpeningStockImportHandlerDeps,
  openingStockCsv: string,
  commit: boolean,
): Promise<OpeningStockImportResult> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyImportRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);

    const { rows } = parseCsv(openingStockCsv, OPENING_STOCK_COLUMNS);
    const lookups = await repo.getOpeningStockLookups();
    const results = validateOpeningStockRows(rows, lookups);
    const reportPaths = writeReportDual(
      null,
      deps.logDir,
      formatOpeningStockImportReport(results),
      'opening-stock',
    );

    if (commit) {
      const warehouseId = await repo.getDefaultWarehouseId();
      const accepted = results.filter((r) => r.status === 'accepted').map((r) => r.record);
      await repo.insertOpeningStockMovements(accepted, warehouseId);
    }

    return {
      reportPath: reportPaths.sourceReportPath ?? reportPaths.logReportPath,
      logReportPath: reportPaths.logReportPath,
      accepted: results.filter((r) => r.status === 'accepted').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    };
  } finally {
    db.close();
  }
}

export function registerOpeningStockImportHandlers(deps: OpeningStockImportHandlerDeps): void {
  ipcMain.handle(channels.importData.openingStockDryRun, (_event, raw: unknown) => {
    const input = ImportOpeningStockInput.parse(raw);
    return runOpeningStockImport(deps, input.openingStockCsv, false);
  });
  ipcMain.handle(channels.importData.openingStockCommit, (_event, raw: unknown) => {
    const input = ImportOpeningStockInput.parse(raw);
    return runOpeningStockImport(deps, input.openingStockCsv, true);
  });
}
