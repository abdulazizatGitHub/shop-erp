import { ipcMain } from 'electron';
import {
  CreateExpenseInput,
  ListExpensesInput,
  type ExpenseCategoryDto,
  type ExpenseDto,
} from '@shop/contracts';
import { createExpense, listCategories, listExpenses } from '@shop/core';
import {
  createKyselyDb,
  KyselyExpenseRepository,
  listBusinessUnits,
  openDatabase,
  type BusinessUnitOption,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface ExpenseHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** See staff.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerExpenseHandlers(deps: ExpenseHandlerDeps): void {
  ipcMain.handle(
    channels.expense.create,
    withError(async (_event, raw: unknown): Promise<ExpenseDto> => {
      const input = CreateExpenseInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyExpenseRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await createExpense(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.expense.list,
    withError(async (_event, raw: unknown): Promise<readonly ExpenseDto[]> => {
      const input = ListExpensesInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyExpenseRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await listExpenses(repo, input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.expense.listCategories,
    withError(async (): Promise<readonly ExpenseCategoryDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyExpenseRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await listCategories(repo);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.expense.listBusinessUnits,
    withError(async (): Promise<readonly BusinessUnitOption[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        // includeOverhead=true — unlike item:lookups, the expense form
        // must offer SHARED alongside PARTS/REPAIR (DC-3/Conflict 6).
        return await listBusinessUnits(createKyselyDb(db), deps.tenantId, true);
      } finally {
        db.close();
      }
    }),
  );
}
