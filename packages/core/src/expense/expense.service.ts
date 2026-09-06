import type { CreateExpenseInput, ListExpensesInput } from '@shop/contracts';
import type {
  ExpenseRecord,
  ExpenseCategoryRecord,
  ExpenseRepositoryPort,
} from './expense.repository.port.js';

/** Pure orchestration, no SQL — same thin-wrapper pattern as advance.service.ts. */
export async function createExpense(
  repo: ExpenseRepositoryPort,
  input: CreateExpenseInput,
): Promise<ExpenseRecord> {
  return repo.createExpense({
    categoryId: input.categoryId,
    expenseDate: input.expenseDate,
    amountPaisa: input.amountPaisa,
    businessUnitId: input.businessUnitId,
    vehicle: input.vehicle ?? null,
    method: input.method,
    notes: input.notes ?? null,
  });
}

export async function listExpenses(
  repo: ExpenseRepositoryPort,
  input: ListExpensesInput,
): Promise<readonly ExpenseRecord[]> {
  return repo.listExpenses({ from: input.from, to: input.to });
}

export async function listCategories(
  repo: ExpenseRepositoryPort,
): Promise<readonly ExpenseCategoryRecord[]> {
  return repo.listCategories();
}
