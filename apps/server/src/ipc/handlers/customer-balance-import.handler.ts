import { readFileSync } from 'node:fs';
import { dialog, ipcMain } from 'electron';
import {
  CUSTOMER_BALANCE_COLUMNS,
  formatCustomerBalanceImportReport,
  parseCsv,
  validateCustomerBalanceRows,
} from '@shop/core';
import { createKyselyDb, KyselyImportRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';
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

async function runCustomerBalanceImport(
  deps: CustomerBalanceImportHandlerDeps,
  filePath: string,
  commit: boolean,
): Promise<CustomerBalanceImportResult> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyImportRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);

    const csvText = readFileSync(filePath, 'utf8');
    const { rows } = parseCsv(csvText, CUSTOMER_BALANCE_COLUMNS);
    const lookups = await repo.getCustomerBalanceLookups();
    const results = validateCustomerBalanceRows(rows, lookups);
    const reportPaths = writeReportDual(
      filePath,
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

async function pickFileAndRun(
  deps: CustomerBalanceImportHandlerDeps,
  commit: boolean,
): Promise<CustomerBalanceImportResult | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Select the Customer Opening Balance CSV',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;

  const [filePath] = picked.filePaths;
  if (!filePath) return null;
  return runCustomerBalanceImport(deps, filePath, commit);
}

export function registerCustomerBalanceImportHandlers(
  deps: CustomerBalanceImportHandlerDeps,
): void {
  // No Zod validation here — these channels take no renderer-supplied
  // argument at all; the file path comes from a native OS dialog, same
  // as item.handler.ts's and supplier-balance-import.handler.ts's
  // pre-existing dryRun/commit channels.
  ipcMain.handle(
    channels.importData.customerBalanceDryRun,
    withError(() => pickFileAndRun(deps, false)),
  );
  ipcMain.handle(
    channels.importData.customerBalanceCommit,
    withError(() => pickFileAndRun(deps, true)),
  );
}
