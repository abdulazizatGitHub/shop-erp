import { newId } from '@shop/shared';
import type {
  ExpenseCategoryAdminRecord,
  ExpenseCategoryRepositoryPort,
  NewExpenseCategoryInput,
  UpdateExpenseCategoryRepoInput,
} from '@shop/core';
import type { Kysely } from 'kysely';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

interface ExpenseCategoryRow {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: string | null;
}

function toRecord(row: ExpenseCategoryRow): ExpenseCategoryAdminRecord {
  return { id: row.id, name: row.name, isActive: row.deletedAt === null };
}

/**
 * P17-4 (docs/phases/PHASE_17.md §2.6, S17-EXP-1). No audit_log/
 * sync_outbox writes — same as brand.repository.ts/service-charge.repository.ts,
 * both reference-data tables, unlike expense.repository.ts's own
 * financial-transaction write path.
 */
export class KyselyExpenseCategoryRepository implements ExpenseCategoryRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
  ) {}

  /**
   * Case-insensitive uniqueness, including deactivated rows — same
   * reasoning as brand.repository.ts's assertNameAvailable (re-using a
   * deactivated name would collide with UNIQUE(tenant_id, name) anyway).
   * `excludeId` lets an update check availability without tripping over
   * the row's own unchanged name.
   */
  private async assertNameAvailable(
    trx: Kysely<Database>,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const rows = await trx
      .selectFrom('expenseCategory')
      .select(['id', 'name'])
      .where('tenantId', '=', this.tenantId)
      .execute();
    const normalized = name.trim().toLowerCase();
    const clash = rows.some(
      (r) => r.id !== excludeId && r.name.trim().toLowerCase() === normalized,
    );
    if (clash) {
      throw new Error(`An expense category named "${name}" already exists`);
    }
  }

  private async getByIdOrThrow(
    trx: Kysely<Database>,
    id: string,
  ): Promise<ExpenseCategoryAdminRecord> {
    const row = await trx
      .selectFrom('expenseCategory')
      .select(['id', 'name', 'deletedAt'])
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirstOrThrow();
    return toRecord(row);
  }

  /**
   * Every category this method creates gets `kind='variable'`,
   * `isBillable=false`, `isOwnerDrawing=false`, `allocationMethod='direct'`,
   * `partsShareBp=null` — matching the majority of the 6 seeded rows
   * (D17-4) and never producing a combination
   * `assertExpenseCategoryCombinationValid` would reject.
   */
  async createExpenseCategory(input: NewExpenseCategoryInput): Promise<ExpenseCategoryAdminRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        await this.assertNameAvailable(trx, input.name);
        const id = newId();
        await trx
          .insertInto('expenseCategory')
          .values({
            id,
            tenantId: this.tenantId,
            name: input.name,
            kind: 'variable',
            isBillable: 0,
            isOwnerDrawing: 0,
            sortOrder: 0,
            deletedAt: null,
            allocationMethod: 'direct',
            partsShareBp: null,
          })
          .execute();
        return this.getByIdOrThrow(trx, id);
      }),
    );
  }

  async updateExpenseCategoryName(
    input: UpdateExpenseCategoryRepoInput,
  ): Promise<ExpenseCategoryAdminRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('expenseCategory')
          .select('id')
          .where('id', '=', input.id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Expense category ${input.id} not found`);
        }
        await this.assertNameAvailable(trx, input.name, input.id);
        await trx
          .updateTable('expenseCategory')
          .set({ name: input.name })
          .where('id', '=', input.id)
          .where('tenantId', '=', this.tenantId)
          .execute();
        return this.getByIdOrThrow(trx, input.id);
      }),
    );
  }

  /**
   * Toggles `deleted_at` (null <-> now) — this IS the deactivate/
   * reactivate mechanism (Q17-5, ANSWERED), there is no separate
   * `is_active` column on this table. Never touches any `expense` row.
   */
  async toggleExpenseCategoryActive(
    id: string,
    isActive: boolean,
  ): Promise<ExpenseCategoryAdminRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('expenseCategory')
          .select('id')
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Expense category ${id} not found`);
        }
        await trx
          .updateTable('expenseCategory')
          .set({ deletedAt: isActive ? null : new Date().toISOString() })
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .execute();
        return this.getByIdOrThrow(trx, id);
      }),
    );
  }

  /**
   * Every row for this tenant — NOT filtered to `deleted_at IS NULL`
   * (unlike expense.repository.ts's listCategories, the create-expense
   * picker): a deactivated row must still be visible here so the owner
   * can reactivate it.
   */
  async listExpenseCategoriesAdmin(): Promise<readonly ExpenseCategoryAdminRecord[]> {
    const rows = await this.db
      .selectFrom('expenseCategory')
      .select(['id', 'name', 'deletedAt'])
      .where('tenantId', '=', this.tenantId)
      .orderBy('name')
      .execute();
    return rows.map(toRecord);
  }
}
