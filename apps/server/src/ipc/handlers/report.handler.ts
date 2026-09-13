import { ipcMain } from 'electron';
import {
  CashBookReportInput,
  DailySalesReportInput,
  ExpenseSummaryInput,
  ReceivablesReportInput,
  StockPerformanceInput,
  UnitPlReportInput,
  WageMonthInput,
  type CashBookRowDto,
  type DailySalesReportRowDto,
  type ExpenseSummaryRowDto,
  type ReceivablesAgingRowDto,
  type StockPerformanceRowDto,
  type WageMonthRowDto,
} from '@shop/contracts';
import {
  createKyselyDb,
  getCashBookReport,
  getDailySalesReport,
  getExpenseSummaryReport,
  getReceivablesAgingReport,
  getStockPerformanceReport,
  getStockValuationReport,
  getUnitPlReport,
  getWageMonthReport,
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
        return await getDailySalesReport(createKyselyDb(db), deps.tenantId, input.from, input.to);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.receivables,
    withError(async (_event, raw: unknown): Promise<readonly ReceivablesAgingRowDto[]> => {
      const input = ReceivablesReportInput.parse(raw ?? {});
      const db = openDatabase(deps.dbPath);
      try {
        return await getReceivablesAgingReport(
          createKyselyDb(db),
          deps.tenantId,
          input.asOfDate ?? todayIso(),
        );
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.stockPerformance,
    withError(async (_event, raw: unknown): Promise<readonly StockPerformanceRowDto[]> => {
      const input = StockPerformanceInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        return await getStockPerformanceReport(
          createKyselyDb(db),
          deps.tenantId,
          input.from,
          input.to,
        );
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.expenseSummary,
    withError(async (_event, raw: unknown): Promise<readonly ExpenseSummaryRowDto[]> => {
      const input = ExpenseSummaryInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        return await getExpenseSummaryReport(
          createKyselyDb(db),
          deps.tenantId,
          input.from,
          input.to,
        );
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
    withError(async (_event, raw: unknown): Promise<UnitPlReport> => {
      const input = UnitPlReportInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        return await getUnitPlReport(createKyselyDb(db), deps.tenantId, input.from, input.to);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.report.wageMonth,
    withError(async (_event, raw: unknown): Promise<readonly WageMonthRowDto[]> => {
      const input = WageMonthInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        return await getWageMonthReport(createKyselyDb(db), deps.tenantId, input.year, input.month);
      } finally {
        db.close();
      }
    }),
  );
}
