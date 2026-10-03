import { ipcMain } from 'electron';
import {
  CreateExpenseInput,
  CreateExpenseCategoryInput,
  ListExpensesInput,
  ToggleExpenseCategoryInput,
  UpdateExpenseCategoryInput,
  type ExpenseCategoryAdminDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
} from '@shop/contracts';
import {
  createExpense,
  createExpenseCategory,
  listCategories,
  listExpenseCategoriesAdmin,
  listExpenses,
  toggleExpenseCategoryActive,
  updateExpenseCategoryName,
  type ExpenseCategoryAdminRecord,
} from '@shop/core';
import {
  createKyselyDb,
  KyselyExpenseCategoryRepository,
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

function toCategoryAdminDto(record: ExpenseCategoryAdminRecord): ExpenseCategoryAdminDto {
  return { id: record.id, name: record.name, isActive: record.isActive };
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

  // P17-4 (docs/phases/PHASE_17.md §2.6, S17-EXP-1) — the Settings
  // "Expense Categories" admin screen's write path. Own repository
  // class (KyselyExpenseCategoryRepository), kept in this file rather
  // than a new handler file since it's the same `expense` channel
  // group and expense.handler.ts stays well under the ~300-line
  // convention (CLAUDE.md §9) with these four added.
  ipcMain.handle(
    channels.expense.createCategory,
    withError(async (_event, raw: unknown): Promise<ExpenseCategoryAdminDto> => {
      const input = CreateExpenseCategoryInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyExpenseCategoryRepository(createKyselyDb(db), deps.tenantId);
        return toCategoryAdminDto(await createExpenseCategory(repo, input));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.expense.updateCategoryName,
    withError(async (_event, raw: unknown): Promise<ExpenseCategoryAdminDto> => {
      const input = UpdateExpenseCategoryInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyExpenseCategoryRepository(createKyselyDb(db), deps.tenantId);
        return toCategoryAdminDto(await updateExpenseCategoryName(repo, input));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.expense.toggleCategoryActive,
    withError(async (_event, raw: unknown): Promise<ExpenseCategoryAdminDto> => {
      const input = ToggleExpenseCategoryInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyExpenseCategoryRepository(createKyselyDb(db), deps.tenantId);
        return toCategoryAdminDto(
          await toggleExpenseCategoryActive(repo, input.id, input.isActive),
        );
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.expense.listCategoriesAdmin,
    withError(async (): Promise<readonly ExpenseCategoryAdminDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyExpenseCategoryRepository(createKyselyDb(db), deps.tenantId);
        const records = await listExpenseCategoriesAdmin(repo);
        return records.map(toCategoryAdminDto);
      } finally {
        db.close();
      }
    }),
  );
}
