import { readFileSync } from 'node:fs';
import { dialog, ipcMain } from 'electron';
import {
  formatSupplierBalanceImportReport,
  parseCsv,
  SUPPLIER_BALANCE_COLUMNS,
  validateSupplierBalanceRows,
} from '@shop/core';
import { createKyselyDb, KyselyImportRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { writeReportDual } from './report-writer.js';

export interface SupplierBalanceImportHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
  readonly logDir: string;
}

export interface SupplierBalanceImportResult {
  readonly reportPath: string;
  readonly logReportPath: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
}

async function runSupplierBalanceImport(
  deps: SupplierBalanceImportHandlerDeps,
  filePath: string,
  commit: boolean,
): Promise<SupplierBalanceImportResult> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyImportRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);

    const csvText = readFileSync(filePath, 'utf8');
    const { rows } = parseCsv(csvText, SUPPLIER_BALANCE_COLUMNS);
    const lookups = await repo.getSupplierBalanceLookups();
    const results = validateSupplierBalanceRows(rows, lookups);
    const reportPaths = writeReportDual(
      filePath,
      deps.logDir,
      formatSupplierBalanceImportReport(results),
      'supplier-balances',
    );

    if (commit) {
      const accepted = results.filter((r) => r.status === 'accepted').map((r) => r.record);
      await repo.insertSupplierOpeningBalances(accepted);
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

async function pickFileAndRun(
  deps: SupplierBalanceImportHandlerDeps,
  commit: boolean,
): Promise<SupplierBalanceImportResult | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Select the Supplier Opening Balance CSV',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;

  const [filePath] = picked.filePaths;
  if (!filePath) return null;
  return runSupplierBalanceImport(deps, filePath, commit);
}

export function registerSupplierBalanceImportHandlers(
  deps: SupplierBalanceImportHandlerDeps,
): void {
  ipcMain.handle(channels.importData.supplierBalanceDryRun, () => pickFileAndRun(deps, false));
  ipcMain.handle(channels.importData.supplierBalanceCommit, () => pickFileAndRun(deps, true));
}
