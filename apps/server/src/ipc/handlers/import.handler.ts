import { readFileSync } from 'node:fs';
import { dialog, ipcMain } from 'electron';
import {
  formatItemImportReport,
  formatOpeningStockImportReport,
  ITEM_COLUMNS,
  OPENING_STOCK_COLUMNS,
  parseCsv,
  validateItemRows,
  validateOpeningStockRows,
} from '@shop/core';
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
  readonly openingStockReportPath: string | null;
  readonly openingStockLogReportPath: string | null;
  readonly openingStockAccepted: number | null;
  readonly openingStockRejected: number | null;
  readonly openingStockSkipped: number | null;
}

async function runImport(
  deps: ImportHandlerDeps,
  itemsFilePath: string,
  openingStockFilePath: string | null,
  commit: boolean,
): Promise<ImportResult> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyImportRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);

    const itemsCsv = readFileSync(itemsFilePath, 'utf8');
    const { rows: itemRows } = parseCsv(itemsCsv, ITEM_COLUMNS);
    const itemLookups = await repo.getItemImportLookups();
    const itemResults = validateItemRows(itemRows, itemLookups);
    const itemReportPaths = writeReportDual(
      itemsFilePath,
      deps.logDir,
      formatItemImportReport(itemResults),
      'items',
    );

    if (commit) {
      const accepted = itemResults.filter((r) => r.status === 'accepted').map((r) => r.record);
      await repo.insertImportedItems(accepted);
    }

    let openingStockReportPath: string | null = null;
    let openingStockLogReportPath: string | null = null;
    let openingStockAccepted: number | null = null;
    let openingStockRejected: number | null = null;
    let openingStockSkipped: number | null = null;

    if (openingStockFilePath) {
      const osCsv = readFileSync(openingStockFilePath, 'utf8');
      const { rows: osRows } = parseCsv(osCsv, OPENING_STOCK_COLUMNS);
      // Matches against items already committed to the DB. On a dry run
      // ahead of committing the Items sheet in the same pass, an item
      // that would be newly created won't be found yet — a real
      // limitation of validating both sheets before anything is written,
      // not a bug: there is no id to match against until it exists.
      const osLookups = await repo.getOpeningStockLookups();
      const osResults = validateOpeningStockRows(osRows, osLookups);
      const osReportPaths = writeReportDual(
        openingStockFilePath,
        deps.logDir,
        formatOpeningStockImportReport(osResults),
        'opening-stock',
      );

      if (commit) {
        const warehouseId = await repo.getDefaultWarehouseId();
        const accepted = osResults.filter((r) => r.status === 'accepted').map((r) => r.record);
        await repo.insertOpeningStockMovements(accepted, warehouseId);
      }

      openingStockReportPath = osReportPaths.sourceReportPath;
      openingStockLogReportPath = osReportPaths.logReportPath;
      openingStockAccepted = osResults.filter((r) => r.status === 'accepted').length;
      openingStockRejected = osResults.filter((r) => r.status === 'rejected').length;
      openingStockSkipped = osResults.filter((r) => r.status === 'skipped').length;
    }

    return {
      itemsReportPath: itemReportPaths.sourceReportPath ?? itemReportPaths.logReportPath,
      itemsLogReportPath: itemReportPaths.logReportPath,
      itemsAccepted: itemResults.filter((r) => r.status === 'accepted').length,
      itemsRejected: itemResults.filter((r) => r.status === 'rejected').length,
      itemsSkipped: itemResults.filter((r) => r.status === 'skipped').length,
      openingStockReportPath,
      openingStockLogReportPath,
      openingStockAccepted,
      openingStockRejected,
      openingStockSkipped,
    };
  } finally {
    db.close();
  }
}

async function pickFilesAndRun(
  deps: ImportHandlerDeps,
  commit: boolean,
): Promise<ImportResult | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Select Items CSV, then (optionally, Ctrl/Cmd-select) the Opening Stock CSV',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;

  const [itemsFilePath, openingStockFilePath] = picked.filePaths;
  if (!itemsFilePath) return null;
  return runImport(deps, itemsFilePath, openingStockFilePath ?? null, commit);
}

export function registerImportHandlers(deps: ImportHandlerDeps): void {
  ipcMain.handle(channels.importData.dryRun, () => pickFilesAndRun(deps, false));
  ipcMain.handle(channels.importData.commit, () => pickFilesAndRun(deps, true));
}
