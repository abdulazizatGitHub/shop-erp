import { ipcMain } from 'electron';
import { ImportSupplierBalanceInput } from '@shop/contracts';
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

/**
 * Option B conversion (Suppliers redesign session): the renderer reads the
 * CSV file via the browser File API and sends content directly — no more
 * dialog.showOpenDialog/readFileSync. Matches
 * opening-stock-import.handler.ts's runOpeningStockImport exactly.
 */
export async function runSupplierBalanceImport(
  deps: SupplierBalanceImportHandlerDeps,
  balancesCsv: string,
  commit: boolean,
): Promise<SupplierBalanceImportResult> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyImportRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);

    const { rows } = parseCsv(balancesCsv, SUPPLIER_BALANCE_COLUMNS);
    const lookups = await repo.getSupplierBalanceLookups();
    const results = validateSupplierBalanceRows(rows, lookups);
    const reportPaths = writeReportDual(
      null,
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

export function registerSupplierBalanceImportHandlers(
  deps: SupplierBalanceImportHandlerDeps,
): void {
  ipcMain.handle(channels.importData.supplierBalanceDryRun, (_event, raw: unknown) => {
    const input = ImportSupplierBalanceInput.parse(raw);
    return runSupplierBalanceImport(deps, input.balancesCsv, false);
  });
  ipcMain.handle(channels.importData.supplierBalanceCommit, (_event, raw: unknown) => {
    const input = ImportSupplierBalanceInput.parse(raw);
    return runSupplierBalanceImport(deps, input.balancesCsv, true);
  });
}
