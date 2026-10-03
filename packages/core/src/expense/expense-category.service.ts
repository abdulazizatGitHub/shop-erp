import type { CreateExpenseCategoryInput, UpdateExpenseCategoryInput } from '@shop/contracts';
import type {
  ExpenseCategoryAdminRecord,
  ExpenseCategoryRepositoryPort,
} from './expense-category.repository.port.js';

export interface ExpenseCategoryFieldChange {
  readonly kind?: string;
  readonly isBillable?: boolean;
  readonly isOwnerDrawing?: boolean;
}

/**
 * Q17-5 (ANSWERED) field-lock rule. The only write path this phase
 * builds (`UpdateExpenseCategoryInput`, name-only) can never actually
 * trip this — there is no field in that type to populate `kind`/
 * `isBillable`/`isOwnerDrawing` with, so Zod itself already makes the
 * locked case unreachable through the UI. Kept as defense-in-depth for
 * any FUTURE write path to this table (e.g. an admin tool), the same
 * way `assertCommissionModeConsistent`
 * (packages/core/src/job/service-charge.service.ts) protects
 * `service_charge` — logic lives in `packages/core`, never a DB
 * constraint (CLAUDE.md §3.7).
 */
export function assertExpenseCategoryFieldsLocked(
  isReferencedByAnyExpense: boolean,
  attemptedChange: ExpenseCategoryFieldChange,
): void {
  if (!isReferencedByAnyExpense) return;
  const lockedKeys = (['kind', 'isBillable', 'isOwnerDrawing'] as const).filter(
    (key) => attemptedChange[key] !== undefined,
  );
  if (lockedKeys.length > 0) {
    throw new Error(
      `Cannot change ${lockedKeys.join(', ')} on a category once referenced by an expense`,
    );
  }
}

export interface ExpenseCategoryCombination {
  readonly isOwnerDrawing: boolean;
  readonly isBillable: boolean;
  readonly allocationMethod: string;
  readonly partsShareBp: number | null;
}

/**
 * Invalid-combination rules (docs/phases/PHASE_17.md §2.6). Neither
 * case is reachable through this phase's own name-only form — every
 * category it creates has `isOwnerDrawing=false`, `isBillable=false`,
 * `allocationMethod='direct'`, `partsShareBp=null`, which both checks
 * below accept. Stated here as a core-level rule for any future write
 * path to `expense_category`, exactly as the plan calls for.
 */
export function assertExpenseCategoryCombinationValid(fields: ExpenseCategoryCombination): void {
  if (fields.isOwnerDrawing && fields.isBillable) {
    throw new Error('An owner-drawing category cannot also be billable');
  }
  if (fields.partsShareBp !== null && fields.allocationMethod !== 'shared_fixed') {
    throw new Error("partsShareBp must be null unless allocationMethod is 'shared_fixed'");
  }
}

/** Pure orchestration, no SQL — same thin-wrapper pattern as brand.service.ts. */
export async function createExpenseCategory(
  repo: ExpenseCategoryRepositoryPort,
  input: CreateExpenseCategoryInput,
): Promise<ExpenseCategoryAdminRecord> {
  return repo.createExpenseCategory({ name: input.name });
}

export async function updateExpenseCategoryName(
  repo: ExpenseCategoryRepositoryPort,
  input: UpdateExpenseCategoryInput,
): Promise<ExpenseCategoryAdminRecord> {
  return repo.updateExpenseCategoryName({ id: input.id, name: input.name });
}

export async function toggleExpenseCategoryActive(
  repo: ExpenseCategoryRepositoryPort,
  id: string,
  isActive: boolean,
): Promise<ExpenseCategoryAdminRecord> {
  return repo.toggleExpenseCategoryActive(id, isActive);
}

export async function listExpenseCategoriesAdmin(
  repo: ExpenseCategoryRepositoryPort,
): Promise<readonly ExpenseCategoryAdminRecord[]> {
  return repo.listExpenseCategoriesAdmin();
}
