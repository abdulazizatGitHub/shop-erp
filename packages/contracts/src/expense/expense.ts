import { z } from 'zod';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PHASE_7.md §5 Correction A/Conflict 4/Conflict 6. businessUnitId is
 * required here even though expense.business_unit_id is nullable in the
 * DB (Correction A) — Zod is the enforcement layer, no schema migration.
 * method extends the existing DB column's vocabulary with
 * 'owner_personal' (Conflict 4) — no new column.
 * "notes" here maps to the DB's `description` column (the live schema
 * has no `notes` column on `expense`) — same mapper-layer convention as
 * party.wage_rate <-> wageRatePaisa.
 */
export const CreateExpenseInput = z.object({
  categoryId: z.string().uuid(),
  expenseDate: z.string().regex(DATE_REGEX),
  amountPaisa: z.number().int().positive(),
  businessUnitId: z.string().uuid(),
  vehicle: z.string().optional(),
  method: z.enum(['cash', 'owner_personal']),
  notes: z.string().optional(),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseInput>;

export const ExpenseDto = z.object({
  id: z.string().uuid(),
  docNo: z.string(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  expenseDate: z.string(),
  amountPaisa: z.number().int(),
  businessUnitId: z.string().uuid(),
  businessUnitCode: z.enum(['PARTS', 'REPAIR', 'SHARED']),
  vehicle: z.string().nullable(),
  method: z.enum(['cash', 'owner_personal']),
  notes: z.string().nullable(),
});
export type ExpenseDto = z.infer<typeof ExpenseDto>;

export const ExpenseCategoryDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.string(),
  allocationMethod: z.string(),
});
export type ExpenseCategoryDto = z.infer<typeof ExpenseCategoryDto>;

export const ListExpensesInput = z.object({
  from: z.string().regex(DATE_REGEX),
  to: z.string().regex(DATE_REGEX),
});
export type ListExpensesInput = z.infer<typeof ListExpensesInput>;

/**
 * P17-4 (docs/phases/PHASE_17.md §2.6, S17-EXP-1, Q-DRAWING/A17-3). Name
 * only — `kind`/`isBillable`/`isOwnerDrawing`/`allocationMethod`/
 * `partsShareBp` are deliberately absent from both inputs below, not
 * merely hidden in the UI: there is no way to send them through this
 * contract at all.
 */
export const CreateExpenseCategoryInput = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateExpenseCategoryInput = z.infer<typeof CreateExpenseCategoryInput>;

export const UpdateExpenseCategoryInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});
export type UpdateExpenseCategoryInput = z.infer<typeof UpdateExpenseCategoryInput>;

export const ToggleExpenseCategoryInput = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});
export type ToggleExpenseCategoryInput = z.infer<typeof ToggleExpenseCategoryInput>;

/**
 * Settings "Expense Categories" admin list row — active AND inactive,
 * unlike `ExpenseCategoryDto` above (the create-expense form's picker,
 * active-only via `listCategories()`'s `deleted_at IS NULL` filter).
 */
export const ExpenseCategoryAdminDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type ExpenseCategoryAdminDto = z.infer<typeof ExpenseCategoryAdminDto>;
