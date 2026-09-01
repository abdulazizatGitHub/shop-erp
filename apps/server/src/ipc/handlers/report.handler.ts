import { ipcMain } from 'electron';
import {
  CashBookReportInput,
  DailySalesReportInput,
  type CashBookRowDto,
  type DailySalesReportRowDto,
  type ReceivablesAgingRowDto,
} from '@shop/contracts';
import {
  createKyselyDb,
  getCashBookReport,
  getDailySalesReport,
  getReceivablesAgingReport,
  getStockValuationReport,
  getUnitPlReport,
  openDatabase,
  type StockValuationReport,
  type UnitPlReport,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface ReportHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// R5 (Unit P&L) has no "no date range" concept at the repository layer —
// getUnitPlReport requires dateFrom/dateTo. The screen's "no inputs"
// requirement is met by computing an effectively-all-time range here,
// server-side, rather than exposing a date picker in the UI.
const ALL_TIME_FROM = '2000-01-01';

export function registerReportHandlers(deps: ReportHandlerDeps): void {
  ipcMain.handle(
    channels.report.stockValuation,
    withError(async (): Promise<StockValuationReport> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getStockValuationReport(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.dailySales,
    withError(async (_event, raw: unknown): Promise<readonly DailySalesReportRowDto[]> => {
      const input = DailySalesReportInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        return await getDailySalesReport(createKyselyDb(db), deps.tenantId, input.date, input.date);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.receivables,
    withError(async (): Promise<readonly ReceivablesAgingRowDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getReceivablesAgingReport(createKyselyDb(db), deps.tenantId, todayIso());
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.cashBook,
    withError(async (_event, raw: unknown): Promise<readonly CashBookRowDto[]> => {
      const input = CashBookReportInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        return await getCashBookReport(
          createKyselyDb(db),
          deps.tenantId,
          input.dateFrom,
          input.dateTo,
        );
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.unitPl,
    withError(async (): Promise<UnitPlReport> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getUnitPlReport(createKyselyDb(db), deps.tenantId, ALL_TIME_FROM, todayIso());
      } finally {
        db.close();
      }
    }),
  );
}
