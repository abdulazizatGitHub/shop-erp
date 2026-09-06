/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Colocated in packages/core/src/expense/ (the folder already existed as
 * a placeholder — packages/core/src/expense/.gitkeep — from before this
 * phase), matching every other domain's own port-plus-service folder.
 *
 * No tenantId parameter on any method, same as every other repository
 * port in this codebase (KyselyPartyRepository, KyselyAdvanceRepository,
 * ...) — tenantId is constructor-injected, never passed per call.
 */

export type ExpenseMethod = 'cash' | 'owner_personal';

export interface NewExpenseInput {
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amountPaisa: number;
  readonly businessUnitId: string;
  readonly vehicle: string | null;
  readonly method: ExpenseMethod;
  readonly notes: string | null;
}

export interface ExpenseRecord {
  readonly id: string;
  readonly docNo: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly expenseDate: string;
  readonly amountPaisa: number;
  readonly businessUnitId: string;
  readonly businessUnitCode: 'PARTS' | 'REPAIR' | 'SHARED';
  readonly vehicle: string | null;
  readonly method: ExpenseMethod;
  readonly notes: string | null;
}

export interface ListExpensesRepoInput {
  readonly from: string;
  readonly to: string;
}

export interface ExpenseCategoryRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly allocationMethod: string;
}

export interface ExpenseRepositoryPort {
  /**
   * ONE TRANSACTION: expense insert (doc_no = EXP-NNNN) + audit_log +
   * sync_outbox. Write path — must be wrapped in withRetry
   * (PROJECT.md BUG-15), same as every other multi-table write.
   */
  createExpense(input: NewExpenseInput): Promise<ExpenseRecord>;
  /** expense_date BETWEEN from AND to, ordered by expense_date DESC. */
  listExpenses(input: ListExpensesRepoInput): Promise<readonly ExpenseRecord[]>;
  /** deleted_at IS NULL, ordered by sort_order. */
  listCategories(): Promise<readonly ExpenseCategoryRecord[]>;
}
