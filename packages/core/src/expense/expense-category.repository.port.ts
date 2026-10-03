/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P17-4 (docs/phases/PHASE_17.md §2.6, S17-EXP-1). Colocated with
 * expense.repository.port.ts (same folder, same module) — a separate
 * file rather than growing that one, since this is a distinct write
 * path (the Settings "Expense Categories" admin screen) against the
 * same `expense_category` table `expense.repository.port.ts`'s
 * `listCategories()` only reads from.
 *
 * Q-DRAWING/A17-3 (ANSWERED): the form this phase builds is name-only.
 * `kind`/`is_billable`/`is_owner_drawing`/`allocation_method`/
 * `parts_share_bp` are never set by any method here — every category
 * this write path creates gets `kind='variable'`, `is_billable=false`,
 * `is_owner_drawing=false`, `allocation_method='direct'`,
 * `parts_share_bp=null` (matching the majority of the 6 seeded rows,
 * per the plan's D17-4 finding).
 */

export interface NewExpenseCategoryInput {
  readonly name: string;
}

export interface UpdateExpenseCategoryInput {
  readonly id: string;
  readonly name: string;
}

export interface ExpenseCategoryAdminRecord {
  readonly id: string;
  readonly name: string;
  /** Derived from `deleted_at` — there is no separate `is_active` column on this table (Q17-5, ANSWERED: deactivation reuses `deleted_at`). */
  readonly isActive: boolean;
}

export interface ExpenseCategoryRepositoryPort {
  /** Rejects a case-insensitive duplicate name for this tenant (UNIQUE(tenant_id, name) is the DB backstop). */
  createExpenseCategory(input: NewExpenseCategoryInput): Promise<ExpenseCategoryAdminRecord>;
  /**
   * Name only — the Zod input this is called with (`UpdateExpenseCategoryInput`
   * in @shop/contracts) has no other field to send, so there is no
   * separate "other fields rejected" case for this method to enforce;
   * see `assertExpenseCategoryFieldsLocked` (expense-category.service.ts)
   * for the defense-in-depth rule a future, wider write path would need.
   */
  updateExpenseCategoryName(input: UpdateExpenseCategoryInput): Promise<ExpenseCategoryAdminRecord>;
  /**
   * Toggles `deleted_at` (null <-> now) — deactivation is soft, via the
   * existing column (Q17-5, ANSWERED), and never touches any
   * `expense.category_id` row that already points at this category:
   * confirmed no report/view query filters `expense_category.deleted_at`
   * (docs/phases/PHASE_17.md §2.6 Correction C17-3).
   */
  toggleExpenseCategoryActive(id: string, isActive: boolean): Promise<ExpenseCategoryAdminRecord>;
  /** Every row for this tenant, active AND inactive — the Settings admin list. Unlike `listCategories()` (the create-expense picker), this is not filtered to `deleted_at IS NULL`, since an inactive row must still be visible here to be reactivated. */
  listExpenseCategoriesAdmin(): Promise<readonly ExpenseCategoryAdminRecord[]>;
}
