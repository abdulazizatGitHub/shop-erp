import { ipcMain } from 'electron';
import { ImportItemsInput } from '@shop/contracts';
import { formatItemImportReport, ITEM_COLUMNS, parseCsv, validateItemRows } from '@shop/core';
import { createKyselyDb, KyselyImportRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { writeReportDual } from './report-writer.js';

export interface ImportHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
  readonly logDir: string;
}

export interface ImportResult {
  readonly itemsReportPath: string;
  readonly itemsLogReportPath: string;
  readonly itemsAccepted: number;
  readonly itemsRejected: number;
  readonly itemsSkipped: number;
}

/** Items CSV import only — Opening Stock CSV is a separate channel/handler (Session 52). */
export async function runImport(
  deps: ImportHandlerDeps,
  itemsCsv: string,
  commit: boolean,
): Promise<ImportResult> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyImportRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);

    const { rows: itemRows } = parseCsv(itemsCsv, ITEM_COLUMNS);
    const itemLookups = await repo.getItemImportLookups();
    const itemResults = validateItemRows(itemRows, itemLookups);
    const itemReportPaths = writeReportDual(
      null,
      deps.logDir,
      formatItemImportReport(itemResults),
      'items',
    );

    if (commit) {
      const accepted = itemResults.filter((r) => r.status === 'accepted').map((r) => r.record);
      await repo.insertImportedItems(accepted);
    }

    return {
      itemsReportPath: itemReportPaths.sourceReportPath ?? itemReportPaths.logReportPath,
      itemsLogReportPath: itemReportPaths.logReportPath,
      itemsAccepted: itemResults.filter((r) => r.status === 'accepted').length,
      itemsRejected: itemResults.filter((r) => r.status === 'rejected').length,
      itemsSkipped: itemResults.filter((r) => r.status === 'skipped').length,
    };
  } finally {
    db.close();
  }
}

export function registerImportHandlers(deps: ImportHandlerDeps): void {
  ipcMain.handle(channels.importData.dryRun, (_event, raw: unknown) => {
    const input = ImportItemsInput.parse(raw);
    return runImport(deps, input.itemsCsv, false);
  });
  ipcMain.handle(channels.importData.commit, (_event, raw: unknown) => {
    const input = ImportItemsInput.parse(raw);
    return runImport(deps, input.itemsCsv, true);
  });
}
