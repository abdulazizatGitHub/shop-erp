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
