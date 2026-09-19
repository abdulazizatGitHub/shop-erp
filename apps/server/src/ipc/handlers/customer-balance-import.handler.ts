import { ipcMain } from 'electron';
import { ImportCustomerBalanceInput } from '@shop/contracts';
import {
  CUSTOMER_BALANCE_COLUMNS,
  formatCustomerBalanceImportReport,
  parseCsv,
  validateCustomerBalanceRows,
} from '@shop/core';
import { createKyselyDb, KyselyImportRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { writeReportDual } from './report-writer.js';

export interface CustomerBalanceImportHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
  readonly logDir: string;
}

export interface CustomerBalanceImportResult {
  readonly reportPath: string;
  readonly logReportPath: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
}

/**
 * CL-10. Option B conversion (Suppliers redesign session precedent): the
 * renderer reads the CSV file via the browser File API and sends content
 * directly — no native file-picker dialog or main-process file read.
 * Matches runSupplierBalanceImport exactly.
 */
export async function runCustomerBalanceImport(
  deps: CustomerBalanceImportHandlerDeps,
  balancesCsv: string,
  commit: boolean,
): Promise<CustomerBalanceImportResult> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyImportRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);

    const { rows } = parseCsv(balancesCsv, CUSTOMER_BALANCE_COLUMNS);
    const lookups = await repo.getCustomerBalanceLookups();
    const results = validateCustomerBalanceRows(rows, lookups);
    const reportPaths = writeReportDual(
      null,
      deps.logDir,
      formatCustomerBalanceImportReport(results),
      'customer-balances',
    );

    if (commit) {
      const accepted = results.filter((r) => r.status === 'accepted').map((r) => r.record);
      await repo.insertCustomerOpeningBalances(accepted);
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

export function registerCustomerBalanceImportHandlers(
  deps: CustomerBalanceImportHandlerDeps,
): void {
  ipcMain.handle(channels.importData.customerBalanceDryRun, (_event, raw: unknown) => {
    const input = ImportCustomerBalanceInput.parse(raw);
    return runCustomerBalanceImport(deps, input.balancesCsv, false);
  });
  ipcMain.handle(channels.importData.customerBalanceCommit, (_event, raw: unknown) => {
    const input = ImportCustomerBalanceInput.parse(raw);
    return runCustomerBalanceImport(deps, input.balancesCsv, true);
  });
}
